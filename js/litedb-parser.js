/**
 * LiteDB Parser for Browser
 * Parses LiteDB v5 database files in the browser
 * 
 * LiteDB is a NoSQL embedded document database that stores data in BSON format.
 * This parser reads the binary format and extracts collections/documents.
 */

class LiteDBParser {
    constructor() {
        this.collections = {};
        this.pageSize = 8192; // Default LiteDB page size
    }

    /**
     * Parse a LiteDB file from ArrayBuffer
     * @param {ArrayBuffer} buffer - The database file content
     * @returns {Object} Parsed database with collections
     */
    async parse(buffer) {
        const dataView = new DataView(buffer);
        const bytes = new Uint8Array(buffer);
        
        // LiteDB v5 file structure:
        // - Header page (page 0)
        // - System collections stored as BSON documents
        // - Data pages with documents

        try {
            // Read header to verify file format
            const header = this.readHeader(dataView);
            console.log('LiteDB Header:', header);

            // LiteDB stores data as BSON documents
            // We'll scan for BSON documents containing our target collections
            
            // Find and parse flmatch collection
            const flmatches = this.findCollection(bytes, 'flmatch');
            this.collections['flmatch'] = flmatches;

            // Additional collections can be added here
            // const ccmatch = this.findCollection(bytes, 'ccmatch');
            // const rwmatch = this.findCollection(bytes, 'rwmatch');

            return {
                success: true,
                collections: this.collections,
                matchCount: flmatches.length
            };

        } catch (error) {
            console.error('LiteDB Parse Error:', error);
            return {
                success: false,
                error: error.message,
                collections: {}
            };
        }
    }

    /**
     * Read LiteDB header from first page
     */
    readHeader(dataView) {
        // LiteDB v5 header structure (simplified)
        // Bytes 0-3: Signature "lite" or similar
        // Following bytes contain version, page size, etc.
        
        const signature = [];
        for (let i = 0; i < 4; i++) {
            signature.push(String.fromCharCode(dataView.getUint8(i)));
        }
        
        return {
            signature: signature.join(''),
            fileSize: dataView.byteLength
        };
    }

    /**
     * Find and extract a collection from the binary data
     * This uses pattern matching to find BSON documents
     */
    findCollection(bytes, collectionName) {
        const documents = [];
        const searchPattern = this.stringToBytes(collectionName);
        
        // Search for collection markers in the binary
        let offset = 0;
        const maxDocs = 500; // Limit to prevent memory issues
        
        while (offset < bytes.length && documents.length < maxDocs) {
            // Look for BSON document patterns
            const docStart = this.findBsonDocument(bytes, offset);
            
            if (docStart === -1) break;
            
            try {
                const doc = this.parseBsonDocument(bytes, docStart);
                if (doc && this.isValidMatchDocument(doc)) {
                    documents.push(doc);
                }
                offset = docStart + (doc?._size || 100);
            } catch (e) {
                offset += 1;
            }
        }
        
        return documents;
    }

    /**
     * Find the start of a BSON document
     * BSON documents start with a 4-byte length (little-endian int32)
     */
    findBsonDocument(bytes, startOffset) {
        // Look for patterns that indicate a match document
        // PlayerScoreboards, MatchStartTime, etc.
        
        const patterns = [
            this.stringToBytes('PlayerScoreboards'),
            this.stringToBytes('MatchStartTime'),
            this.stringToBytes('DutyId')
        ];

        for (let i = startOffset; i < bytes.length - 20; i++) {
            for (const pattern of patterns) {
                if (this.matchPattern(bytes, i, pattern)) {
                    // Found a pattern, backtrack to find document start
                    return this.findDocumentStart(bytes, i);
                }
            }
        }
        
        return -1;
    }

    /**
     * Find the start of a BSON document by backtracking
     */
    findDocumentStart(bytes, fieldOffset) {
        // BSON documents start with int32 length
        // We backtrack to find a valid document start
        
        for (let i = fieldOffset - 1; i >= Math.max(0, fieldOffset - 1000); i--) {
            // Check if this could be a valid document start
            const potentialLength = this.readInt32LE(bytes, i);
            
            if (potentialLength > 100 && potentialLength < 100000) {
                // Check if the next bytes after length + start look valid
                if (bytes[i + 4] > 0 && bytes[i + 4] < 20) {
                    return i;
                }
            }
        }
        
        return fieldOffset - 50; // Fallback
    }

    /**
     * Parse a BSON document from bytes
     */
    parseBsonDocument(bytes, offset) {
        const docLength = this.readInt32LE(bytes, offset);
        
        if (docLength <= 0 || docLength > 500000 || offset + docLength > bytes.length) {
            return null;
        }

        const doc = { _size: docLength };
        let pos = offset + 4;
        const endPos = offset + docLength - 1;

        while (pos < endPos) {
            const type = bytes[pos++];
            if (type === 0) break; // End of document

            // Read field name (null-terminated string)
            const nameStart = pos;
            while (pos < endPos && bytes[pos] !== 0) pos++;
            const name = this.bytesToString(bytes.slice(nameStart, pos));
            pos++; // Skip null terminator

            // Parse value based on type
            const value = this.parseBsonValue(bytes, pos, type, endPos);
            doc[name] = value.value;
            pos = value.newPos;
        }

        return doc;
    }

    /**
     * Parse a BSON value based on its type
     */
    parseBsonValue(bytes, pos, type, endPos) {
        switch (type) {
            case 0x01: // Double
                const doubleVal = this.readFloat64LE(bytes, pos);
                return { value: doubleVal, newPos: pos + 8 };
            
            case 0x02: // String
                const strLen = this.readInt32LE(bytes, pos);
                const str = this.bytesToString(bytes.slice(pos + 4, pos + 4 + strLen - 1));
                return { value: str, newPos: pos + 4 + strLen };
            
            case 0x03: // Embedded document
            case 0x04: // Array
                const docLen = this.readInt32LE(bytes, pos);
                const embeddedDoc = this.parseBsonDocument(bytes, pos);
                return { value: embeddedDoc, newPos: pos + docLen };
            
            case 0x08: // Boolean
                return { value: bytes[pos] === 1, newPos: pos + 1 };
            
            case 0x09: // UTC DateTime
                const timestamp = this.readInt64LE(bytes, pos);
                return { value: new Date(Number(timestamp)), newPos: pos + 8 };
            
            case 0x0A: // Null
                return { value: null, newPos: pos };
            
            case 0x10: // Int32
                return { value: this.readInt32LE(bytes, pos), newPos: pos + 4 };
            
            case 0x12: // Int64
                const int64Val = this.readInt64LE(bytes, pos);
                return { value: Number(int64Val), newPos: pos + 8 };
            
            default:
                // Skip unknown types by finding next field
                return { value: null, newPos: pos + 1 };
        }
    }

    /**
     * Check if a parsed document looks like a valid match document
     */
    isValidMatchDocument(doc) {
        return doc && (
            doc.PlayerScoreboards ||
            doc.MatchStartTime ||
            doc.DutyId ||
            doc.Players
        );
    }

    // Utility functions
    stringToBytes(str) {
        return new TextEncoder().encode(str);
    }

    bytesToString(bytes) {
        return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    }

    matchPattern(bytes, offset, pattern) {
        for (let i = 0; i < pattern.length; i++) {
            if (bytes[offset + i] !== pattern[i]) return false;
        }
        return true;
    }

    readInt32LE(bytes, offset) {
        return bytes[offset] | 
               (bytes[offset + 1] << 8) | 
               (bytes[offset + 2] << 16) | 
               (bytes[offset + 3] << 24);
    }

    readInt64LE(bytes, offset) {
        const low = this.readInt32LE(bytes, offset);
        const high = this.readInt32LE(bytes, offset + 4);
        return BigInt(low) + (BigInt(high) << 32n);
    }

    readFloat64LE(bytes, offset) {
        const buffer = new ArrayBuffer(8);
        const view = new DataView(buffer);
        for (let i = 0; i < 8; i++) {
            view.setUint8(i, bytes[offset + i]);
        }
        return view.getFloat64(0, true);
    }
}

// Alternative: Simple JSON-based parser for pre-exported data
class JsonDataParser {
    /**
     * Parse JSON exported data
     */
    parse(jsonData) {
        if (typeof jsonData === 'string') {
            jsonData = JSON.parse(jsonData);
        }
        
        return {
            success: true,
            collections: jsonData,
            matchCount: jsonData.flmatch?.length || 0
        };
    }
}

// Export for use in app.js
window.LiteDBParser = LiteDBParser;
window.JsonDataParser = JsonDataParser;

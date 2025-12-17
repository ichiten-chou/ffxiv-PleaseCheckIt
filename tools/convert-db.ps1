<# 
.SYNOPSIS
    Convert PvpStats data.db (LiteDB) to JSON format
.DESCRIPTION
    Reads PvpStats plugin LiteDB database and exports to JSON for web usage
#>

param(
    [string]$InputPath = "$env:APPDATA\XIVLauncher\pluginConfigs\PvpStats\data.db",
    [string]$OutputPath = ".\data.json"
)

# Find LiteDB.dll
$liteDbPaths = @(
    "$env:APPDATA\XIVLauncher\installedPlugins\PvpStats\2.6.0.4\LiteDB.dll",
    "$env:APPDATA\XIVLauncher\addon\Hooks\dev\LiteDB.dll",
    ".\LiteDB.dll"
)

$liteDbDll = $null
foreach ($path in $liteDbPaths) {
    if (Test-Path $path) {
        $liteDbDll = $path
        break
    }
}

if (-not $liteDbDll) {
    Write-Host "Error: Cannot find LiteDB.dll" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $InputPath)) {
    Write-Host "Error: Cannot find data.db: $InputPath" -ForegroundColor Red
    exit 1
}

Write-Host "Loading LiteDB from: $liteDbDll" -ForegroundColor Cyan
Add-Type -Path $liteDbDll

Write-Host "Opening database: $InputPath" -ForegroundColor Cyan

try {
    $connectionString = "Filename=$InputPath;Mode=Shared;ReadOnly=true"
    $db = New-Object LiteDB.LiteDatabase($connectionString)
    
    $collections = $db.GetCollectionNames()
    Write-Host "Found collections: $($collections -join ', ')" -ForegroundColor Green
    
    $output = @{
        exportTime = (Get-Date).ToString("o")
        flmatch    = @()
    }
    
    # Export flmatch collection
    if ($collections -contains "flmatch") {
        Write-Host "Exporting flmatch collection..." -ForegroundColor Cyan
        $flmatch = $db.GetCollection("flmatch")
        $allMatches = $flmatch.FindAll()
        
        $matchList = [System.Collections.ArrayList]::new()
        $count = 0
        
        foreach ($match in $allMatches) {
            $count++
            
            $matchData = @{
                MatchStartTime = $null
                Players        = @()
                Teams          = @()
            }
            
            # Extract MatchStartTime
            if ($match.ContainsKey("MatchStartTime")) {
                $matchData.MatchStartTime = $match["MatchStartTime"].ToString()
            }
            
            # Extract PlayerScoreboards
            $playerList = [System.Collections.ArrayList]::new()
            
            if ($match.ContainsKey("PlayerScoreboards")) {
                $scoreboards = $match["PlayerScoreboards"]
                if ($scoreboards.IsDocument) {
                    $sbDoc = $scoreboards.AsDocument
                    foreach ($key in $sbDoc.Keys) {
                        $playerStats = $sbDoc[$key]
                        $pData = @{
                            key     = $key
                            kills   = 0
                            deaths  = 0
                            assists = 0
                            damage  = 0
                        }
                        
                        if ($playerStats.IsDocument) {
                            $psDoc = $playerStats.AsDocument
                            if ($psDoc.ContainsKey("Kills")) { $pData.kills = $psDoc["Kills"].AsInt32 }
                            if ($psDoc.ContainsKey("Deaths")) { $pData.deaths = $psDoc["Deaths"].AsInt32 }
                            if ($psDoc.ContainsKey("Assists")) { $pData.assists = $psDoc["Assists"].AsInt32 }
                            
                            # Calculate correct player damage (subtract damage to crystals/objectives)
                            if ($psDoc.ContainsKey("DamageDealt")) {
                                $damageDealt = $psDoc["DamageDealt"].AsInt64
                                $damageToOther = 0
                                
                                # In Fields of Glory, DamageToOther contains damage to crystals
                                if ($psDoc.ContainsKey("DamageToOther")) {
                                    $damageToOther = $psDoc["DamageToOther"].AsInt64
                                }
                                
                                # Correct player damage = Total damage - Damage to objectives
                                $pData.damage = $damageDealt - $damageToOther
                            }
                        }
                        
                        [void]$playerList.Add($pData)
                    }
                }
            }
            
            # Extract Players array for Job and Team info
            if ($match.ContainsKey("Players")) {
                $playersArray = $match["Players"]
                if ($playersArray.IsArray) {
                    foreach ($p in $playersArray.AsArray) {
                        if ($p.IsDocument) {
                            $pDoc = $p.AsDocument
                            $nameObj = $pDoc["Name"]
                            $playerName = ""
                            $playerWorld = ""
                            
                            if ($nameObj -and $nameObj.IsDocument) {
                                $nameDoc = $nameObj.AsDocument
                                if ($nameDoc.ContainsKey("Name")) { $playerName = $nameDoc["Name"].AsString }
                                if ($nameDoc.ContainsKey("HomeWorld")) { $playerWorld = $nameDoc["HomeWorld"].AsString }
                            }
                            
                            $lookupKey = "$playerName $playerWorld"
                            
                            # Find matching player and update Job/Team
                            foreach ($existing in $playerList) {
                                if ($existing.key -eq $lookupKey) {
                                    if ($pDoc.ContainsKey("Job")) {
                                        $jobVal = $pDoc["Job"]
                                        if ($jobVal.IsString) { $existing.job = $jobVal.AsString }
                                    }
                                    if ($pDoc.ContainsKey("Team")) {
                                        $teamVal = $pDoc["Team"]
                                        if ($teamVal.IsInt32) { $existing.team = $teamVal.AsInt32 }
                                        elseif ($teamVal.IsString) { $existing.team = $teamVal.AsString }
                                    }
                                    if ($pDoc.ContainsKey("Alliance")) {
                                        $existing.alliance = $pDoc["Alliance"].AsInt32
                                    }
                                    break
                                }
                            }
                        }
                    }
                }
            }
            
            # Extract TeamStats from Teams (Standard) or TeamScoreboards (Legacy)
            $teamList = [System.Collections.ArrayList]::new()
            
            # Helper to map team name to ID
            $teamNameMap = @{
                "Maelstrom" = 0
                "Adders"    = 1
                "Flames"    = 2
            }

            if ($match.ContainsKey("Teams") -and $match["Teams"].IsDocument) {
                # New format: Teams is a Dictionary<string, FLTeam>
                $teamsDoc = $match["Teams"].AsDocument
                foreach ($key in $teamsDoc.Keys) {
                    $tDoc = $teamsDoc[$key].AsDocument
                    $teamData = @{
                        team        = 0
                        ranking     = 0
                        progress    = 0
                        occupations = 0
                        kills       = 0
                        deaths      = 0
                    }
                    
                    # Map team name/key to ID
                    if ($teamNameMap.ContainsKey($key)) {
                        $teamData.team = $teamNameMap[$key]
                    }
                    else {
                        $teamData.team = -1 # Unknown
                    }

                    if ($tDoc.ContainsKey("Placement")) { $teamData.ranking = $tDoc["Placement"].AsInt32 }
                    if ($tDoc.ContainsKey("TotalPoints")) { $teamData.progress = $tDoc["TotalPoints"].AsInt32 }
                    if ($tDoc.ContainsKey("OccupationPoints")) { $teamData.occupations = $tDoc["OccupationPoints"].AsInt32 }
                    if ($tDoc.ContainsKey("KillPoints")) { $teamData.kills = $tDoc["KillPoints"].AsInt32 }
                    if ($tDoc.ContainsKey("DeathPointLosses")) { $teamData.deaths = $tDoc["DeathPointLosses"].AsInt32 }
                    
                    [void]$teamList.Add($teamData)
                }
            }
            elseif ($match.ContainsKey("TeamScoreboards") -and $match["TeamScoreboards"].IsArray) {
                # Legacy format
                foreach ($team in $match["TeamScoreboards"].AsArray) {
                    if ($team.IsDocument) {
                        $tDoc = $team.AsDocument
                        $teamData = @{
                            team        = 0
                            ranking     = 0
                            progress    = 0
                            occupations = 0
                            kills       = 0
                            deaths      = 0
                        }
                        if ($tDoc.ContainsKey("Team")) { $teamData.team = $tDoc["Team"].AsInt32 }
                        if ($tDoc.ContainsKey("Progress")) { $teamData.progress = $tDoc["Progress"].AsInt32 }
                        if ($tDoc.ContainsKey("Occupations")) { $teamData.occupations = $tDoc["Occupations"].AsInt32 }
                        if ($tDoc.ContainsKey("Kills")) { $teamData.kills = $tDoc["Kills"].AsInt32 }
                        if ($tDoc.ContainsKey("Deaths")) { $teamData.deaths = $tDoc["Deaths"].AsInt32 }
                        # Estimate ranking if missing (based on progress) - skipped for now
                        [void]$teamList.Add($teamData)
                    }
                }
            }
            
            $matchData.Players = $playerList.ToArray()
            $matchData.Teams = $teamList.ToArray()
            [void]$matchList.Add($matchData)
        }
        
        $output.flmatch = $matchList.ToArray()
        Write-Host "Exported $count matches" -ForegroundColor Green
    }
    
    # Output JSON with proper UTF-8 encoding
    $json = $output | ConvertTo-Json -Depth 10 -Compress
    [System.IO.File]::WriteAllText($OutputPath, $json, [System.Text.Encoding]::UTF8)
    
    Write-Host "Successfully exported to: $OutputPath" -ForegroundColor Green
    Write-Host "File size: $([math]::Round((Get-Item $OutputPath).Length / 1KB, 2)) KB" -ForegroundColor Cyan
    
    $db.Dispose()
}
catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host $_.ScriptStackTrace -ForegroundColor Yellow
    exit 1
}

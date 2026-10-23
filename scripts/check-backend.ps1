param(
    [string]$BaseUrl = 'http://localhost:8000',
    [string]$Database = 'db_stores'
)
$ErrorActionPreference = 'Stop'
$credential = Get-Credential -Message 'Учётная запись Django (не локальный демо-пользователь)'
$loginBody = @{
    username = $credential.UserName
    password = $credential.GetNetworkCredential().Password
} | ConvertTo-Json
$session = Invoke-RestMethod "$BaseUrl/api/login/" -Method Post -ContentType 'application/json' -Body $loginBody
$loginBody = $null
$credential = $null
$headers = @{ Authorization = "Bearer $($session.access)" }
$session = $null

function Assert-Status([string]$Url, [int]$Expected, [string]$Method = 'GET', $Payload = $null) {
    $argsForRequest = @{ Uri = $Url; Method = $Method; UseBasicParsing = $true; Headers = $headers }
    if ($null -ne $Payload) {
        $argsForRequest.ContentType = 'application/json'
        $argsForRequest.Body = $Payload | ConvertTo-Json
    }
    try { $status = [int](Invoke-WebRequest @argsForRequest).StatusCode }
    catch {
        if ($null -eq $_.Exception.Response) { throw }
        $status = [int]$_.Exception.Response.StatusCode
    }
    if ($status -ne $Expected) { throw "Ожидался HTTP $Expected, получен $status для $Url" }
}

function Send-Query([string]$Query, [bool]$Refresh = $false) {
    $body = @{ db_name = $Database; query = $Query; refresh = $Refresh } | ConvertTo-Json
    return Invoke-RestMethod "$BaseUrl/api/query/" -Method Post -Headers $headers -ContentType 'application/json' -Body $body
}

function Quote-Ident([string]$Name) { return '"' + $Name.Replace('"', '""') + '"' }

$databases = Invoke-RestMethod "$BaseUrl/api/databases/" -Headers $headers
if ($databases.databases -notcontains $Database) { throw 'У пользователя нет доступа к выбранной БД.' }
$dbPath = [uri]::EscapeDataString($Database)
$schema = Invoke-RestMethod "$BaseUrl/api/databases/$dbPath/schema/" -Headers $headers
if (-not $schema.tables.Count) { throw 'В БД нет доступных предметных таблиц.' }
$table = $schema.tables[0]
$tablePath = [uri]::EscapeDataString("$($table.schema).$($table.name)")
$tableSql = (Quote-Ident $table.schema) + '.' + (Quote-Ident $table.name)
$preview = Invoke-RestMethod "$BaseUrl/api/databases/$dbPath/tables/$tablePath/preview/?limit=5" -Headers $headers
if ($preview.row_count -gt 5) { throw 'Нарушен limit предпросмотра.' }
$null = Invoke-RestMethod "$BaseUrl/api/databases/$dbPath/tables/$tablePath/columns/" -Headers $headers
$field = [uri]::EscapeDataString($table.columns[0].name)
$null = Invoke-RestMethod "$BaseUrl/api/databases/$dbPath/tables/$tablePath/suggestions/?field=$field" -Headers $headers

$first = Send-Query "SELECT count(*) AS total FROM $tableSql" $true
$second = Send-Query "SELECT count(*) AS total FROM $tableSql"
if ($first.cached -or -not $second.cached) { throw 'Кеш не работает. Проверьте Redis.' }
$emptyFirst = Send-Query "SELECT * FROM $tableSql WHERE FALSE" $true
$emptySecond = Send-Query "SELECT * FROM $tableSql WHERE FALSE"
if ($emptyFirst.data.Count -ne 0 -or -not $emptySecond.cached) { throw 'Пустой результат не кешируется.' }

foreach ($query in @('SELECT 1; DELETE FROM stores_store', 'SELECT pg_sleep(10)',
                      "WITH x AS (DELETE FROM stores_store RETURNING *) SELECT * FROM x")) {
    Assert-Status "$BaseUrl/api/query/" 400 'POST' @{ db_name = $Database; query = $query }
}
Assert-Status "$BaseUrl/api/query/" 403 'POST' @{ db_name = 'default'; query = 'SELECT 1' }
Assert-Status "$BaseUrl/api/databases/$dbPath/tables/pg_authid/preview/" 404

$joinTable = $schema.tables | Where-Object { $_.foreign_keys.Count -gt 0 } | Select-Object -First 1
if ($joinTable) {
    $fk = $joinTable.foreign_keys[0]
    $source = (Quote-Ident $joinTable.schema) + '.' + (Quote-Ident $joinTable.name)
    $target = (Quote-Ident $fk.references.schema) + '.' + (Quote-Ident $fk.references.table)
    $conditions = for ($index = 0; $index -lt $fk.columns.Count; $index++) {
        's.' + (Quote-Ident $fk.columns[$index]) + '=t.' + (Quote-Ident $fk.references.columns[$index])
    }
    $null = Send-Query "SELECT count(*) AS joined_rows FROM $source s JOIN $target t ON $($conditions -join ' AND ')" $true
    Write-Output 'OK: JOIN по внешнему ключу'
}
Write-Output 'OK: JWT, schema/PK/FK, columns, preview, suggestions, SELECT, refresh, cache, empty cache, SQL safety, default DB denial'
$headers = $null

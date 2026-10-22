<?php
header('Content-Type: application/json; charset=UTF-8');
header('Access-Control-Allow-Origin: *');

$configs = [
    ['host' => 'localhost', 'db' => 'u457767862_demo_bss', 'user' => 'u457767862_demo_bss', 'pass' => 'Demo@One1'],
    ['host' => '127.0.0.1', 'db' => 'u457767862_demo_bss', 'user' => 'u457767862_demo_bss', 'pass' => 'Demo@One1'],
    ['host' => 'localhost', 'db' => 'u457767862_demo_bss', 'user' => 'u457767862_admin', 'pass' => 'Demo@One1'],
];

$connected = false;
$working_config = null;
$tested = [];
$pdo = null;

foreach ($configs as $cfg) {
    try {
        $pdo = new PDO("mysql:host={$cfg['host']};dbname={$cfg['db']};charset=utf8mb4", $cfg['user'], $cfg['pass'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
        ]);
        $connected = true;
        $working_config = ['host' => $cfg['host'], 'db' => $cfg['db'], 'user' => $cfg['user']];
        break;
    } catch (PDOException $e) {
        $tested[] = ['user' => $cfg['user'], 'host' => $cfg['host'], 'error' => $e->getMessage()];
    }
}

if ($connected && $pdo) {
    $tables = $pdo->query("SHOW TABLES")->fetchAll(PDO::FETCH_COLUMN);
    echo json_encode([
        'success' => true,
        'message' => 'Connected successfully!',
        'config' => $working_config,
        'tables' => $tables
    ], JSON_PRETTY_PRINT);
} else {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Connection failed',
        'attempts' => $tested
    ], JSON_PRETTY_PRINT);
}

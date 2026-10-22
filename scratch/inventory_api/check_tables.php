<?php
header('Content-Type: application/json; charset=UTF-8');
header('Access-Control-Allow-Origin: *');

try {
    $pdo = new PDO("mysql:host=localhost;dbname=u457767862_demo_bss;charset=utf8mb4", "u457767862_demo_bss", "Demo@One1", [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
    ]);

    $vendors = $pdo->query("SELECT * FROM onu_vendors LIMIT 50")->fetchAll();
    $models = $pdo->query("SELECT * FROM onu_models LIMIT 50")->fetchAll();
    $onus = $pdo->query("SELECT * FROM onu LIMIT 50")->fetchAll();

    // Also get columns structure
    $onu_cols = $pdo->query("DESCRIBE onu")->fetchAll();
    $model_cols = $pdo->query("DESCRIBE onu_models")->fetchAll();
    $vendor_cols = $pdo->query("DESCRIBE onu_vendors")->fetchAll();

    echo json_encode([
        'success' => true,
        'vendor_count' => count($vendors),
        'model_count' => count($models),
        'onu_count' => count($onus),
        'vendors' => $vendors,
        'models' => $models,
        'onus' => $onus,
        'schema' => [
            'onu' => $onu_cols,
            'onu_models' => $model_cols,
            'onu_vendors' => $vendor_cols
        ]
    ], JSON_PRETTY_PRINT);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}

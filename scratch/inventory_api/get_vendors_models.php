<?php
// get_vendors_models.php - Fetch all hardware vendors and models
require_once __DIR__ . '/db.php';

try {
    $stmtV = $pdo->query("SELECT id, name FROM onu_vendors ORDER BY name ASC");
    $vendors = $stmtV->fetchAll();

    $stmtM = $pdo->query("SELECT id, vendor_id, name, type, description, status FROM onu_models ORDER BY name ASC");
    $models = $stmtM->fetchAll();

    $result = array_map(function($v) use ($models) {
        $v['models'] = array_values(array_filter($models, fn($m) => (int)$m['vendor_id'] === (int)$v['id']));
        return $v;
    }, $vendors);

    echo json_encode([
        'success' => true,
        'vendors' => $result,
        'all_models' => $models,
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
}

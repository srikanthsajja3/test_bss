<?php
// add_onu.php - Add a new physical ONU to inventory
require_once __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed. Use POST.']);
    exit();
}

$input = json_decode(file_get_contents('php://input'), true);

$model_id      = isset($input['model_id']) ? (int)$input['model_id'] : 0;
$serial_no     = !empty($input['serial_no']) ? trim($input['serial_no']) : null;
$mac_address   = !empty($input['mac_address']) ? strtoupper(trim($input['mac_address'])) : null;
$status        = !empty($input['status']) ? $input['status'] : 'in_stock';
$purchase_date = !empty($input['purchase_date']) ? $input['purchase_date'] : null;

$validStatuses = ['in_stock', 'reserved', 'assigned', 'faulty', 'in_repair', 'retired'];

if ($model_id <= 0) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Valid model_id is required.']);
    exit();
}

if (!in_array($status, $validStatuses, true)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid status. Allowed values: ' . implode(', ', $validStatuses)]);
    exit();
}

// Verify model exists
$chk = $pdo->prepare("SELECT id FROM onu_models WHERE id = ?");
$chk->execute([$model_id]);
if (!$chk->fetch()) {
    http_response_code(404);
    echo json_encode(['success' => false, 'message' => "Model ID {$model_id} does not exist."]);
    exit();
}

try {
    $stmt = $pdo->prepare("
        INSERT INTO onu (model_id, serial_no, mac_address, status, purchase_date)
        VALUES (?, ?, ?, ?, ?)
    ");
    $stmt->execute([$model_id, $serial_no, $mac_address, $status, $purchase_date]);

    $newId = (int)$pdo->lastInsertId();

    http_response_code(201);
    echo json_encode([
        'success' => true,
        'message' => 'ONU added to inventory successfully.',
        'id' => $newId,
        'onu' => [
            'id' => $newId,
            'model_id' => $model_id,
            'serial_no' => $serial_no,
            'mac_address' => $mac_address,
            'status' => $status,
            'purchase_date' => $purchase_date,
        ]
    ]);
} catch (PDOException $e) {
    if ($e->getCode() == 23000) {
        http_response_code(409);
        echo json_encode([
            'success' => false,
            'message' => 'Duplicate entry: An ONU with this Serial Number or MAC Address already exists.'
        ]);
    } else {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    }
}

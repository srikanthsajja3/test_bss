<?php
// update_onu.php - Update an existing ONU
require_once __DIR__ . '/db.php';

$input = json_decode(file_get_contents('php://input'), true);

$id = isset($_GET['id']) ? (int)$_GET['id'] : (isset($input['id']) ? (int)$input['id'] : 0);

if ($id <= 0) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Valid ONU ID is required.']);
    exit();
}

// Check if ONU exists
$chk = $pdo->prepare("SELECT * FROM onu WHERE id = ?");
$chk->execute([$id]);
$existing = $chk->fetch();

if (!$existing) {
    http_response_code(404);
    echo json_encode(['success' => false, 'message' => "ONU with ID {$id} not found."]);
    exit();
}

$fieldsToUpdate = [];
$params = [];

if (isset($input['status'])) {
    $validStatuses = ['in_stock', 'reserved', 'assigned', 'faulty', 'in_repair', 'retired'];
    if (!in_array($input['status'], $validStatuses, true)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Invalid status value.']);
        exit();
    }
    $fieldsToUpdate[] = "status = :status";
    $params[':status'] = $input['status'];
}

if (isset($input['model_id'])) {
    $modelId = (int)$input['model_id'];
    $mChk = $pdo->prepare("SELECT id FROM onu_models WHERE id = ?");
    $mChk->execute([$modelId]);
    if (!$mChk->fetch()) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => "Model ID {$modelId} not found."]);
        exit();
    }
    $fieldsToUpdate[] = "model_id = :model_id";
    $params[':model_id'] = $modelId;
}

if (isset($input['serial_no'])) {
    $serial = trim($input['serial_no']);
    if ($serial === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'serial_no cannot be empty.']);
        exit();
    }
    $fieldsToUpdate[] = "serial_no = :serial_no";
    $params[':serial_no'] = $serial;
}

if (array_key_exists('mac_address', $input)) {
    $mac = !empty($input['mac_address']) ? strtoupper(trim($input['mac_address'])) : null;
    $fieldsToUpdate[] = "mac_address = :mac_address";
    $params[':mac_address'] = $mac;
}

if (array_key_exists('purchase_date', $input)) {
    $fieldsToUpdate[] = "purchase_date = :purchase_date";
    $params[':purchase_date'] = !empty($input['purchase_date']) ? $input['purchase_date'] : null;
}

if (empty($fieldsToUpdate)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'No fields provided to update.']);
    exit();
}

$params[':id'] = $id;
$sql = "UPDATE onu SET " . implode(", ", $fieldsToUpdate) . " WHERE id = :id";

try {
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    // Fetch updated record
    $refetch = $pdo->prepare("
        SELECT 
            o.*, 
            m.name AS model_name, 
            m.type AS pon_type, 
            v.name AS vendor_name
        FROM onu o
        JOIN onu_models m ON o.model_id = m.id
        JOIN onu_vendors v ON m.vendor_id = v.id
        WHERE o.id = ?
    ");
    $refetch->execute([$id]);
    $updated = $refetch->fetch();

    echo json_encode([
        'success' => true,
        'message' => 'ONU updated successfully.',
        'data' => $updated
    ]);
} catch (PDOException $e) {
    if ($e->getCode() == 23000) {
        http_response_code(409);
        echo json_encode(['success' => false, 'message' => 'Duplicate Serial Number or MAC Address already exists.']);
    } else {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    }
}

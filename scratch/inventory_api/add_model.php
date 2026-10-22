<?php
// add_model.php - Add a new ONU model under a vendor
require_once __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed. Use POST.']);
    exit();
}

$input = json_decode(file_get_contents('php://input'), true);

$vendor_id   = isset($input['vendor_id']) ? (int)$input['vendor_id'] : 0;
$name        = isset($input['name']) ? trim($input['name']) : '';
$type        = !empty($input['type']) ? strtoupper(trim($input['type'])) : 'GPON';
$description = isset($input['description']) ? trim($input['description']) : '';
$status      = !empty($input['status']) ? strtolower(trim($input['status'])) : 'active';

$validTypes    = ['GPON', 'XPON', 'EPON'];
$validStatuses = ['active', 'discontinued', 'eol'];

if ($vendor_id <= 0) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Valid vendor_id is required.']);
    exit();
}

if ($name === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Model name is required.']);
    exit();
}

if (!in_array($type, $validTypes, true)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid PON type. Allowed values: ' . implode(', ', $validTypes)]);
    exit();
}

if (!in_array($status, $validStatuses, true)) {
    $status = 'active';
}

try {
    // 1. Verify vendor exists
    $chkV = $pdo->prepare("SELECT id, name FROM onu_vendors WHERE id = ?");
    $chkV->execute([$vendor_id]);
    $vendor = $chkV->fetch();
    if (!$vendor) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => "Vendor with ID {$vendor_id} does not exist."]);
        exit();
    }

    // 2. Check for duplicate model name under this vendor
    $chkM = $pdo->prepare("SELECT id, name FROM onu_models WHERE vendor_id = ? AND LOWER(name) = LOWER(?)");
    $chkM->execute([$vendor_id, $name]);
    $existing = $chkM->fetch();

    if ($existing) {
        http_response_code(409);
        echo json_encode([
            'success' => false,
            'message' => "Model '{$existing['name']}' already exists under vendor '{$vendor['name']}'.",
            'model' => $existing,
        ]);
        exit();
    }

    // 3. Insert model
    $stmt = $pdo->prepare("
        INSERT INTO onu_models (vendor_id, name, type, description, status)
        VALUES (?, ?, ?, ?, ?)
    ");
    $stmt->execute([$vendor_id, $name, $type, $description, $status]);
    $newId = (int)$pdo->lastInsertId();

    http_response_code(201);
    echo json_encode([
        'success' => true,
        'message' => "Model '{$name}' added successfully under '{$vendor['name']}'.",
        'model' => [
            'id' => $newId,
            'vendor_id' => $vendor_id,
            'vendor_name' => $vendor['name'],
            'name' => $name,
            'type' => $type,
            'description' => $description,
            'status' => $status,
        ]
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
}

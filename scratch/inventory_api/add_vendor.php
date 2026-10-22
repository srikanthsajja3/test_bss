<?php
// add_vendor.php - Add a new hardware vendor
require_once __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed. Use POST.']);
    exit();
}

$input = json_decode(file_get_contents('php://input'), true);
$name = isset($input['name']) ? trim($input['name']) : '';

if ($name === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Vendor name is required.']);
    exit();
}

try {
    // Check for duplicate vendor name (case-insensitive)
    $chk = $pdo->prepare("SELECT id, name FROM onu_vendors WHERE LOWER(name) = LOWER(?)");
    $chk->execute([$name]);
    $existing = $chk->fetch();

    if ($existing) {
        http_response_code(409);
        echo json_encode([
            'success' => false,
            'message' => "Vendor '{$existing['name']}' already exists.",
            'vendor' => $existing,
        ]);
        exit();
    }

    $stmt = $pdo->prepare("INSERT INTO onu_vendors (name) VALUES (?)");
    $stmt->execute([$name]);
    $newId = (int)$pdo->lastInsertId();

    http_response_code(201);
    echo json_encode([
        'success' => true,
        'message' => "Vendor '{$name}' added successfully.",
        'vendor' => [
            'id' => $newId,
            'name' => $name,
            'models' => [],
        ]
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
}

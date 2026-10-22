<?php
// delete_onu.php - Delete an ONU from inventory
require_once __DIR__ . '/db.php';

$input = json_decode(file_get_contents('php://input'), true);
$id = isset($_GET['id']) ? (int)$_GET['id'] : (isset($input['id']) ? (int)$input['id'] : 0);

if ($id <= 0) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Valid ONU ID is required.']);
    exit();
}

try {
    $stmt = $pdo->prepare("DELETE FROM onu WHERE id = ?");
    $stmt->execute([$id]);

    if ($stmt->rowCount() === 0) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => "ONU with ID {$id} not found."]);
        exit();
    }

    echo json_encode(['success' => true, 'message' => "ONU #{$id} deleted successfully."]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
}

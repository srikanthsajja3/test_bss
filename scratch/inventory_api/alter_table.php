<?php
require_once __DIR__ . '/db.php';

try {
    $pdo->exec("ALTER TABLE onu MODIFY serial_no VARCHAR(64) NULL DEFAULT NULL");
    $cols = $pdo->query("DESCRIBE onu")->fetchAll();
    echo json_encode(['success' => true, 'message' => 'Altered table successfully', 'cols' => $cols], JSON_PRETTY_PRINT);
} catch (PDOException $e) {
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}

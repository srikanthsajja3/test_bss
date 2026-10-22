<?php
require_once __DIR__ . '/db.php';

try {
    $cols = $pdo->query("DESCRIBE onu")->fetchAll();
    echo json_encode(['success' => true, 'cols' => $cols], JSON_PRETTY_PRINT);
} catch (PDOException $e) {
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}

<?php
// get_inventory_stats.php - Summary metrics for ONU inventory
require_once __DIR__ . '/db.php';

try {
    // Status breakdown
    $statusQuery = $pdo->query("
        SELECT status, COUNT(*) as count 
        FROM onu 
        GROUP BY status
    ");
    $statusRows = $statusQuery->fetchAll();

    $stats = [
        'total' => 0,
        'in_stock' => 0,
        'reserved' => 0,
        'assigned' => 0,
        'faulty' => 0,
        'in_repair' => 0,
        'retired' => 0,
    ];

    foreach ($statusRows as $row) {
        $c = (int)$row['count'];
        $stats[$row['status']] = $c;
        $stats['total'] += $c;
    }

    // Technology breakdown (GPON / EPON / XPON)
    $typeQuery = $pdo->query("
        SELECT m.type, COUNT(o.id) as count
        FROM onu o
        JOIN onu_models m ON o.model_id = m.id
        GROUP BY m.type
    ");
    $stats['by_type'] = $typeQuery->fetchAll();

    // Vendor breakdown
    $vendorQuery = $pdo->query("
        SELECT v.name, COUNT(o.id) as count
        FROM onu o
        JOIN onu_models m ON o.model_id = m.id
        JOIN onu_vendors v ON m.vendor_id = v.id
        GROUP BY v.id, v.name
        ORDER BY count DESC
    ");
    $stats['by_vendor'] = $vendorQuery->fetchAll();

    echo json_encode(['success' => true, 'stats' => $stats]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
}

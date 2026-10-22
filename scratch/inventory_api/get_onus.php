<?php
// get_onus.php - Fetch ONUs with filtering, search, and pagination
require_once __DIR__ . '/db.php';

$status    = isset($_GET['status']) && $_GET['status'] !== '' && $_GET['status'] !== 'all' ? $_GET['status'] : null;
$vendor_id = !empty($_GET['vendor_id']) ? (int)$_GET['vendor_id'] : null;
$model_id  = !empty($_GET['model_id']) ? (int)$_GET['model_id'] : null;
$pon_type  = !empty($_GET['type']) ? $_GET['type'] : null;
$search    = isset($_GET['search']) ? trim($_GET['search']) : '';
$limit     = isset($_GET['limit']) ? max(1, min(200, (int)$_GET['limit'])) : 50;
$offset    = isset($_GET['offset']) ? max(0, (int)$_GET['offset']) : 0;

$whereClauses = [];
$params = [];

if ($status) {
    $whereClauses[] = "o.status = :status";
    $params[':status'] = $status;
}
if ($vendor_id) {
    $whereClauses[] = "v.id = :vendor_id";
    $params[':vendor_id'] = $vendor_id;
}
if ($model_id) {
    $whereClauses[] = "m.id = :model_id";
    $params[':model_id'] = $model_id;
}
if ($pon_type) {
    $whereClauses[] = "m.type = :pon_type";
    $params[':pon_type'] = $pon_type;
}
if ($search !== '') {
    $whereClauses[] = "(o.serial_no LIKE :search1 OR o.mac_address LIKE :search2)";
    $params[':search1'] = "%{$search}%";
    $params[':search2'] = "%{$search}%";
}

$whereSql = count($whereClauses) > 0 ? "WHERE " . implode(" AND ", $whereClauses) : "";

try {
    // 1. Get total matching count
    $countSql = "
        SELECT COUNT(*) AS total
        FROM onu o
        JOIN onu_models m ON o.model_id = m.id
        JOIN onu_vendors v ON m.vendor_id = v.id
        {$whereSql}
    ";
    $countStmt = $pdo->prepare($countSql);
    $countStmt->execute($params);
    $totalCount = (int)$countStmt->fetchColumn();

    // 2. Fetch paginated records
    $dataSql = "
        SELECT 
            o.id,
            o.serial_no,
            o.mac_address,
            o.status,
            o.purchase_date,
            o.created_at,
            o.updated_at,
            m.id AS model_id,
            m.name AS model_name,
            m.type AS pon_type,
            m.description AS model_description,
            v.id AS vendor_id,
            v.name AS vendor_name
        FROM onu o
        JOIN onu_models m ON o.model_id = m.id
        JOIN onu_vendors v ON m.vendor_id = v.id
        {$whereSql}
        ORDER BY o.id DESC
        LIMIT {$limit} OFFSET {$offset}
    ";
    $stmt = $pdo->prepare($dataSql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll();

    echo json_encode([
        'success' => true,
        'total' => $totalCount,
        'count' => count($rows),
        'limit' => $limit,
        'offset' => $offset,
        'data' => $rows
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Failed to fetch ONUs: ' . $e->getMessage()
    ]);
}

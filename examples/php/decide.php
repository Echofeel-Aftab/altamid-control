<?php

declare(strict_types=1);

function decide_access(array $input): array
{
    $fresh = $input['fresh'];
    $stored = $input['stored'];
    $failed = (bool) $input['transportFailed'];
    if (!$failed && is_array($fresh)) {
        if (($fresh['v'] ?? null) !== 1 || !is_bool($fresh['usable'] ?? null)) {
            return ['access' => 'restrict', 'source' => 'fresh', 'reason' => 'lease_not_understood'];
        }
        return [
            'access' => $fresh['usable'] ? 'allow' : 'restrict',
            'source' => 'fresh',
            'reason' => (string) $fresh['verdict'],
        ];
    }
    if ($failed && is_array($stored) && ($stored['v'] ?? null) === 1 && ($stored['usable'] ?? null) === true) {
        $until = strtotime((string) ($stored['offline']['until'] ?? ''));
        if ($until !== false && ((int) $input['now']) * 1000 <= $until * 1000) {
            return ['access' => 'allow', 'source' => 'stored', 'reason' => 'offline_until'];
        }
        return ['access' => 'restrict', 'source' => 'stored', 'reason' => 'offline_elapsed'];
    }
    return [
        'access' => 'restrict',
        'source' => 'none',
        'reason' => $failed ? 'unreachable' : 'no_lease',
    ];
}

if (PHP_SAPI === 'cli' && isset($argv[0]) && basename($argv[0]) === basename(__FILE__)) {
    $cases = json_decode(file_get_contents($argv[1]), true, 512, JSON_THROW_ON_ERROR);
    foreach ($cases as $case) {
        $decision = decide_access($case);
        echo json_encode($decision, JSON_UNESCAPED_SLASHES), "\n";
    }
}

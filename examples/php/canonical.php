<?php

declare(strict_types=1);

function canonical_json(mixed $value): string
{
    return canonical_encode($value);
}

function canonical_encode(mixed $value): string
{
    if ($value === null) {
        return 'null';
    }
    if (is_bool($value)) {
        return $value ? 'true' : 'false';
    }
    if (is_int($value)) {
        return (string) $value;
    }
    if (is_float($value)) {
        if (floor($value) != $value) {
            throw new RuntimeException('Canonical JSON allows only safe integers.');
        }
        return (string) (int) $value;
    }
    if (is_string($value)) {
        $json = json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($json === false) {
            throw new RuntimeException('Could not encode a string.');
        }
        return $json;
    }
    if ($value instanceof stdClass) {
        $vars = get_object_vars($value);
        $keys = array_keys($vars);
        sort($keys, SORT_STRING);
        $parts = [];
        foreach ($keys as $key) {
            $encodedKey = json_encode((string) $key, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            $parts[] = $encodedKey . ':' . canonical_encode($vars[$key]);
        }
        return '{' . implode(',', $parts) . '}';
    }
    if (is_array($value)) {
        $parts = [];
        foreach ($value as $item) {
            $parts[] = canonical_encode($item);
        }
        return '[' . implode(',', $parts) . ']';
    }
    throw new RuntimeException('Canonical JSON received a value it cannot encode.');
}

if (PHP_SAPI === 'cli' && isset($argv[0]) && basename($argv[0]) === basename(__FILE__)) {
    $values = json_decode(file_get_contents($argv[1]), false, 512, JSON_THROW_ON_ERROR);
    foreach ($values as $value) {
        echo canonical_encode($value), "\n";
    }
}

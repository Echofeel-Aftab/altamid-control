<?php

declare(strict_types=1);

if (!function_exists('sodium_crypto_sign_verify_detached')) {
    fwrite(STDERR, "sodium extension is required\n");
    exit(2);
}

$input = json_decode(file_get_contents($argv[1]), true, 512, JSON_THROW_ON_ERROR);
$public = sodium_base642bin($input['publicKeyRaw'], SODIUM_BASE64_VARIANT_URLSAFE_NO_PADDING);
$signature = sodium_base642bin($input['signature'], SODIUM_BASE64_VARIANT_URLSAFE_NO_PADDING);
$ok = sodium_crypto_sign_verify_detached($signature, $input['canonical'], $public);
echo $ok ? "ok\n" : "bad\n";

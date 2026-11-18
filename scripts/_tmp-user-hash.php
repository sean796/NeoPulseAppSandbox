<?php
$user = Neo_Pulse_App_Teams_Store::get_user_by_email("sean@neodigital.ca");
if (!$user) { echo "missing\n"; return; }
$hash = (string)($user["password_hash"] ?? "");
echo "email=" . $user["email"] . " hashPrefix=" . substr($hash, 0, 4) . " hashLen=" . strlen($hash) . "\n";

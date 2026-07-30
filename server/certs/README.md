# Database CA certificates

Supabase signs its Postgres certificates with a private CA ("Supabase Root 2021
CA") that is not in the system trust store, so connecting with TLS verification
on fails with:

```
self-signed certificate in certificate chain
```

Download `prod-ca-2021.crt` from the Supabase dashboard — **Database settings →
SSL configuration** — drop it in this directory, and point the server at it:

```bash
DATABASE_CA_CERT=./certs/prod-ca-2021.crt
```

Verify the download matches the certificate the server actually presents:

```bash
openssl x509 -in certs/prod-ca-2021.crt -noout -subject -fingerprint -sha256
# subject=... CN=Supabase Root 2021 CA
# sha256 Fingerprint=80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA
```

A CA certificate is public information, not a secret, so commit it: deployments
and teammates then need no extra setup step. On hosts with no writable
filesystem, put the PEM text straight into `DATABASE_CA_CERT` instead.

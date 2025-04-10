# SSL Certificates

This directory contains SSL certificates for HTTPS support.

## Files
- `key.pem`: Private key file
- `cert.pem`: Certificate file

## Self-signed Certificate Generation

These certificates are self-signed and should only be used for development/testing.
For production, please use certificates from a trusted Certificate Authority (CA).

To generate new self-signed certificates, use the following OpenSSL command:

```bash
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes
```
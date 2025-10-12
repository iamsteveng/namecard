# API E2E Fixtures

Place anonymised card artefacts here for the API end-to-end tests.

## Required Assets
- `card-sample.jpg` — real or synthetic business card image used by the upload/scan scenario.
  - Resolution: ≥300 DPI, JPEG format, file size ≤200 KB.
  - Sanitize any personally identifiable information before committing.
  - After adding the file, run `file tests/fixtures/card-sample.jpg` to confirm it is detected as `JPEG image`.

## Notes
- Keep additional OCR/Textract mock payloads alongside the image (e.g. `textract-basic.json`).
- If an asset is environment-specific and should not be committed, add it to `.gitignore` and document the manual provisioning steps here.

---
name: ScalePad API Integration
description: ScalePad Lifecycle Manager API details — base URL, auth, endpoints, response format
type: reference
---
- Base URL: `https://api.scalepad.com/core/v1`
- Auth: `x-api-key` header with token-based API key
- Endpoints: `/assets/hardware` (list hardware), `/clients` (list clients)
- Pagination: `page_size` (max 200), `cursor` for next page
- Response: `{ data: [...], total_count, next_cursor }`
- Hardware asset fields: `id`, `name`, `client.{id,name}`, `manufacturer.{id,name}`, `model.{number,description}`, `serial_number`, `type`, `location_name`
- Filtering: `filter[field]=value` or `filter[field]=operator:value`
- Lifecycle Manager also has notes endpoint at `/lifecycle-manager/v1/notes/{id}`
- Secret: SCALEPAD_API_KEY (already configured)

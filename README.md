# MediFlow Backend

Backend API for the MediFlow medical management system.

## Installation

```
npm install
```

## Environment Variables

Copy `.env.example` to `.env` and fill in the values:

```
cp .env.example .env
```

| Variable | Required | Description |
|---|---|---|
| `MONGODB_URI` | Yes | MongoDB Atlas connection string |
| `ADMIN_PHONES` | Yes | Comma-separated 10-digit phone numbers allowed to call admin endpoints |
| `PORT` | No | Server port (default: 3000) |

Example `.env`:
```
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/mediflow
ADMIN_PHONES=9876543210,9123456789
```

## Development

```
npm start
```

## Running Tests

```
npm test
```

---

## API Endpoints

### Auth

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/send-otp` | Send OTP to phone number |
| POST | `/api/auth/verify` | Verify OTP |
| POST | `/api/auth/register` | Register new user after OTP verification |

### User

| Method | Path | Description |
|---|---|---|
| GET | `/api/medicines` | List all medicines |
| GET | `/api/addresses/:userId` | Get addresses for a user |
| POST | `/api/addresses` | Add address for a user |
| POST | `/api/orders` | Place a new order |
| GET | `/api/orders/:userId` | Get order history for a user |
| POST | `/api/upload-rx` | Upload prescription image |

### Admin (protected)

All `/api/admin/*` endpoints and `PUT /api/orders/:orderId/status` require the `x-admin-phone` header set to a phone number listed in `ADMIN_PHONES`.

**Example request header:**
```
x-admin-phone: 9876543210
```

| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/orders` | List all orders |
| PUT | `/api/orders/:orderId/status` | Update order status `{ status }` |
| GET | `/api/admin/inventory` | List inventory items (with medicine info) |
| POST | `/api/admin/inventory/adjust` | Adjust stock `{ medicineId, qtyChange, reason, orderId?, byUserId? }` |
| POST | `/api/admin/inventory/seed` | Create InventoryItem records for medicines that don't have one yet |
| POST | `/api/admin/dispatch` | Create dispatch job `{ orderId, assignedToDeliveryId?, notes? }` |
| GET | `/api/admin/dispatch` | List dispatch jobs (filter: `?status=Created`) |

### Delivery

| Method | Path | Description |
|---|---|---|
| GET | `/api/delivery/dispatch` | List dispatch jobs (filter: `?assignedToDeliveryId=...`) |
| PUT | `/api/delivery/dispatch/:id/status` | Update dispatch job status `{ status }` |

**Dispatch job statuses:** `Created`, `Assigned`, `PickedUp`, `InTransit`, `Delivered`, `Cancelled`

When a dispatch job is set to `Delivered`, the linked order's status is automatically updated to `Delivered`.

---

## Requirements

- Node.js 18+
- MongoDB Atlas (or local MongoDB)

## License

MIT


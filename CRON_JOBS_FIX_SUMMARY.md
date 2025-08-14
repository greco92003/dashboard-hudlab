# Cron Jobs Fix - Vercel Hobby Plan Compliance

## Problem

The application was using more than 2 cron jobs, which exceeds the Vercel hobby plan limit of 2 cron jobs per day.

## Previous Configuration

```json
{
  "crons": [
    {
      "path": "/api/cron/sync-deals",
      "schedule": "0 6 * * *"
    },
    {
      "path": "/api/cron/process-pending-coupons",
      "schedule": "*/30 * * * *" // ❌ This was running every 30 minutes
    }
  ]
}
```

## Solution

Replaced the frequent cron job with webhook-based processing for pending coupons.

## New Configuration

```json
{
  "crons": [
    {
      "path": "/api/cron/sync-deals",
      "schedule": "0 6 * * *" // ✅ Daily at 6 AM
    },
    {
      "path": "/api/cron/sync-designer-mockups",
      "schedule": "0 8 * * *" // ✅ Daily at 8 AM (changed from every 2 hours)
    }
  ]
}
```

## Changes Made

### 1. Fixed Designer Mockups Cron Schedule

- Changed `/api/cron/sync-designer-mockups` from `0 */2 * * *` (every 2 hours = 12 times/day) to `0 8 * * *` (daily at 8 AM)
- Now using only 2 cron jobs total (within the 2-job limit for Vercel hobby plan)

### 2. Enhanced Webhook Processing

Modified `lib/nuvemshop/webhook-processor.ts` to automatically process pending coupons when new products are created:

```typescript
// Check if this is a new brand and trigger auto-coupon generation
if (
  event === "product/created" &&
  processedProduct.brand &&
  processedProduct.published
) {
  await this.checkAndProcessNewBrand(processedProduct.brand);
}
```

### 3. Added New Methods

- `checkAndProcessNewBrand()`: Checks if a brand is new and triggers auto-coupon generation
- `processPendingCouponsForBrand()`: Processes pending coupons for a specific brand

### 4. Updated API Authentication

Modified both endpoints to support service role authentication for webhook calls:

#### `/api/admin/process-pending-coupons`

- Added service role authentication check
- Allows webhook calls using `SUPABASE_SERVICE_ROLE_KEY`

#### `/api/partners/coupons/auto-generate`

- Added service role authentication check
- Fixed user scope issues for webhook calls

### 5. Added Coupon Events to Webhook Types

Extended `types/webhooks.ts` to include coupon events:

```typescript
// Coupon events
| "coupon/created"
| "coupon/updated"
| "coupon/deleted"
```

## How It Works Now

1. **Product Creation Webhook**: When a new product is created in NuvemShop
2. **Brand Detection**: Webhook processor checks if it's a new brand
3. **Auto-Coupon Generation**: If new brand, generates 15% discount coupon
4. **Pending Processing**: Immediately processes the pending coupon to create it in NuvemShop

## Benefits

✅ **Vercel Compliance**: Now using only 2 cron jobs total (within 2-job limit)
✅ **Optimized Schedule**: Designer mockups sync once daily instead of every 2 hours
✅ **Reduced API Calls**: From 12 calls/day to 1 call/day for designer mockups
✅ **Better Resource Usage**: More efficient use of Vercel hobby plan limits
✅ **Maintained Functionality**: All features still work with daily sync schedule

## Testing

The build now passes successfully with no errors:

- All TypeScript errors resolved
- ESLint issues fixed
- Webhook authentication properly configured
- Service role access working for automated calls

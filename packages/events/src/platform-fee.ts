import { Prisma } from "@prisma/client";

export const PLATFORM_FEE_PERCENT_DEFAULT = new Prisma.Decimal("10.00");

export function resolveCurrentPlatformFeePercent(
  stored: Prisma.Decimal | null | undefined
) {
  return stored ?? PLATFORM_FEE_PERCENT_DEFAULT;
}

export function computeEventPlatformFeeSnapshot(
  gross: Prisma.Decimal,
  percent: Prisma.Decimal
) {
  const platformFeeAmount = gross
    .mul(percent)
    .div(100)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

  return {
    platformFeeAmount,
    netAmount: gross.minus(platformFeeAmount)
  };
}

export function projectCurrentTicketPricing(
  buyerAmount: Prisma.Decimal,
  percent: Prisma.Decimal
) {
  const { platformFeeAmount, netAmount } =
    computeEventPlatformFeeSnapshot(buyerAmount, percent);

  return {
    buyerAmount,
    platformFeeAmount,
    netReceivableAmount: netAmount
  };
}

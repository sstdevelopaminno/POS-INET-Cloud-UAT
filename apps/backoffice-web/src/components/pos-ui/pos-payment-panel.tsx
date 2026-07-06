"use client";

type PaymentText = {
  subtotal: string;
  total: string;
  checkout: string;
  retry: string;
  managerOverride: string;
  cancelBill: string;
  holdBill: string;
  promotion: string;
  billNo: string;
  status: string;
  statusValue: string;
  tax?: string;
  paymentMethod?: string;
};

type Props = {
  subtotal: number;
  total: number;
  taxAmount?: number;
  taxLines?: Array<{ id: string; label: string; amount: number }>;
  onCheckout: () => void;
  onRetry?: () => void;
  onManagerOverride?: () => void;
  onCancelBill?: () => void;
  onHoldBill?: () => void;
  onTableQrOrder?: () => void;
  onPromotion?: () => void;
  showHoldBill?: boolean;
  showTableQrOrder?: boolean;
  tableQrOrderLabel?: string;
  checkoutLabel?: string;
  checkoutDisabled?: boolean;
  retryDisabled?: boolean;
  retryLabel?: string;
  submitting?: boolean;
  submittingLabel?: string;
  pendingLabel?: string;
  message?: string | null;
  pending?: boolean;
  billNo?: string;
  actionsDisabled?: boolean;
  cancelBillDisabled?: boolean;
  cancelLabel?: string;
  transferVerificationLabel?: string;
  transferVerificationBadge?: {
    label: string;
    tone: "pass" | "fail" | "warn";
  } | null;
  paymentMethodValue?: string;
  text: PaymentText;
};

type SecondaryAction = {
  key: string;
  className: string;
  onClick?: () => void;
  disabled: boolean;
  label: string;
};

function formatMoney(value: number): string {
  return `฿${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`;
}

export function PosPaymentPanel({
  subtotal,
  total,
  taxAmount,
  taxLines = [],
  onCheckout,
  onRetry,
  onManagerOverride,
  onCancelBill,
  onHoldBill,
  onTableQrOrder,
  onPromotion,
  showHoldBill = true,
  showTableQrOrder = false,
  tableQrOrderLabel = "QR สั่งอาหาร",
  checkoutLabel,
  checkoutDisabled,
  retryDisabled,
  retryLabel,
  submitting,
  submittingLabel = "Submitting...",
  billNo = "BILL-2026-0001",
  actionsDisabled = false,
  cancelBillDisabled = false,
  cancelLabel,
  transferVerificationLabel,
  transferVerificationBadge,
  paymentMethodValue,
  text
}: Props) {
  const secondaryActions = ([
    showHoldBill
      ? {
          key: "hold",
          className: "posui-btn",
          onClick: onHoldBill,
          disabled: actionsDisabled,
          label: text.holdBill
        }
      : null,
    showTableQrOrder
      ? {
          key: "table-qr",
          className: "posui-btn posui-btn--table-qr",
          onClick: onTableQrOrder,
          disabled: actionsDisabled,
          label: tableQrOrderLabel
        }
      : null,
    {
      key: "promotion",
      className: "posui-btn posui-btn--promo",
      onClick: onPromotion,
      disabled: actionsDisabled,
      label: text.promotion
    },
    {
      key: "cancel",
      className: "posui-btn posui-btn--cancel-near-checkout",
      onClick: onCancelBill,
      disabled: actionsDisabled || cancelBillDisabled,
      label: cancelLabel ?? text.cancelBill
    }
  ] as Array<SecondaryAction | null>).filter((action): action is SecondaryAction => Boolean(action));

  return (
    <section className="posui-payment-panel">
      <div className="posui-bill-summary-card">
        <p>
          <span>{text.billNo}</span>
          <strong>{billNo}</strong>
        </p>
        {text.paymentMethod ? (
          <p>
            <span>{text.paymentMethod}</span>
            <strong>{paymentMethodValue ?? "-"}</strong>
          </p>
        ) : null}
        <p>
          <span>{text.status}</span>
          <strong>{text.statusValue}</strong>
        </p>
        {transferVerificationBadge && transferVerificationLabel ? (
          <p>
            <span>{transferVerificationLabel}</span>
            <strong className={`posui-transfer-badge is-${transferVerificationBadge.tone}`}>{transferVerificationBadge.label}</strong>
          </p>
        ) : null}
        <p>
          <span>{text.subtotal}</span>
          <strong>{formatMoney(Math.max(0, subtotal))}</strong>
        </p>
        {taxLines.length > 0 ? taxLines.map((line) => (
          <p key={line.id}>
            <span>{line.label}</span>
            <strong>{line.amount < 0 ? "-" : "+"}{formatMoney(Math.abs(line.amount))}</strong>
          </p>
        )) : text.tax ? (
          <p>
            <span>{text.tax}</span>
            <strong>{formatMoney(Math.max(0, taxAmount ?? 0))}</strong>
          </p>
        ) : null}
        <p className="is-total">
          <span>{text.total}</span>
          <strong>{formatMoney(total)}</strong>
        </p>
      </div>

      <div
        className={`posui-bill-actions posui-bill-actions--${secondaryActions.length}`}
        style={{ display: "grid", gridTemplateColumns: `repeat(${secondaryActions.length}, minmax(0, 1fr))`, gap: 8 }}
      >
        {secondaryActions.map((action) => (
          <button key={action.key} type="button" className={action.className} onClick={action.onClick} disabled={action.disabled}>
            {action.label}
          </button>
        ))}
      </div>

      <div className="posui-payment-actions posui-payment-actions--single" style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
        <button
          type="button"
          onClick={onCheckout}
          disabled={checkoutDisabled || submitting}
          className="posui-btn posui-btn--primary posui-btn--checkout"
        >
          {submitting ? submittingLabel : checkoutLabel ?? text.checkout}
        </button>
        {onRetry ? (
          <button type="button" onClick={onRetry} disabled={retryDisabled || submitting} className="posui-btn posui-btn--retry-emergency">
            {retryLabel ?? text.retry}
          </button>
        ) : null}
        {onManagerOverride ? (
          <button type="button" onClick={onManagerOverride} className="posui-btn">
            {text.managerOverride}
          </button>
        ) : null}
      </div>
    </section>
  );
}

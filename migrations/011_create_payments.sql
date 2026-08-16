-- Payments table for Razorpay integration
-- Records order creation, captures, and payment statuses tied to transactions.

CREATE TABLE public.payments (
    id uuid NOT NULL DEFAULT gen_random_uuid (),
    transaction_id uuid NOT NULL,
    payer_id uuid NOT NULL,
    payee_id uuid NOT NULL,
    amount numeric(10, 2) NOT NULL,
    currency text NOT NULL DEFAULT 'INR',
    razorpay_order_id text NOT NULL,
    razorpay_payment_id text NULL,
    razorpay_signature text NULL,
    status text NOT NULL DEFAULT 'created',
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT payments_pkey PRIMARY KEY (id),
    CONSTRAINT payments_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transactions (id) ON DELETE CASCADE,
    CONSTRAINT payments_payer_id_fkey FOREIGN KEY (payer_id) REFERENCES public.profiles (id) ON DELETE CASCADE,
    CONSTRAINT payments_payee_id_fkey FOREIGN KEY (payee_id) REFERENCES public.profiles (id) ON DELETE CASCADE,
    CONSTRAINT payments_razorpay_order_id_unique UNIQUE (razorpay_order_id),
    CONSTRAINT payments_status_check CHECK (
        status = ANY (ARRAY[
            'created'::text,
            'captured'::text,
            'failed'::text,
            'refunded'::text
        ])
    )
) TABLESPACE pg_default;

CREATE INDEX payments_transaction_idx ON public.payments (transaction_id);
CREATE INDEX payments_payer_idx ON public.payments (payer_id);
CREATE INDEX payments_payee_idx ON public.payments (payee_id);
CREATE INDEX payments_razorpay_order_idx ON public.payments (razorpay_order_id);
CREATE INDEX payments_status_idx ON public.payments (status);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

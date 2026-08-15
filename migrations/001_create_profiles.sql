CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE public.profiles (
    id uuid NOT NULL DEFAULT gen_random_uuid (),
    firebase_uid text NOT NULL,
    username text NOT NULL,
    email text NOT NULL,
    profile_photo text NULL,
    role text NOT NULL DEFAULT 'user'::text,
    avg_rating numeric(3, 2) NOT NULL DEFAULT 0.00,
    rating_count integer NOT NULL DEFAULT 0,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT profiles_pkey PRIMARY KEY (id),
    CONSTRAINT profiles_email_key UNIQUE (email),
    CONSTRAINT profiles_firebase_uid_key UNIQUE (firebase_uid),
    CONSTRAINT profiles_name_key UNIQUE (username),
    CONSTRAINT profiles_avg_rating_check CHECK (
        (avg_rating >= (0)::numeric) AND (avg_rating <= (5)::numeric)
    ),
    CONSTRAINT profiles_rating_count_check CHECK (rating_count >= 0),
    CONSTRAINT profiles_role_check CHECK (
        role = ANY (ARRAY['user'::text, 'admin'::text])
    )
) TABLESPACE pg_default;
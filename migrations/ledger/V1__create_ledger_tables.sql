SET search_path TO ledger;

-- Chart of Accounts
CREATE TABLE accounts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL,
  code            VARCHAR(20) NOT NULL,
  name            VARCHAR(200) NOT NULL,
  account_type    VARCHAR(20) NOT NULL,
  parent_id       UUID REFERENCES accounts(id),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  description     TEXT,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_account_code_tenant UNIQUE (tenant_id, code)
);

-- Journal Entry Header
CREATE TABLE journal_entries (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL,
  entry_number    SERIAL,
  entry_date      DATE NOT NULL,
  description     TEXT NOT NULL,
  reference       VARCHAR(100),
  status          VARCHAR(20) NOT NULL DEFAULT 'draft',
  period_id       UUID,
  posted_by       UUID,
  posted_at       TIMESTAMPTZ,
  reversed_by_id  UUID REFERENCES journal_entries(id),
  reversal_of_id  UUID REFERENCES journal_entries(id),
  tags            JSONB DEFAULT '[]',
  source_module   VARCHAR(100),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Journal Entry Lines (Debit/Credit)
CREATE TABLE journal_lines (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  journal_entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL,
  account_id      UUID NOT NULL REFERENCES accounts(id),
  debit_amount    DECIMAL(18,4) NOT NULL DEFAULT 0,
  credit_amount   DECIMAL(18,4) NOT NULL DEFAULT 0,
  description     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_debit_or_credit CHECK (
    (debit_amount > 0 AND credit_amount = 0) OR
    (credit_amount > 0 AND debit_amount = 0)
  )
);

-- Fiscal Periods
CREATE TABLE fiscal_periods (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL,
  name            VARCHAR(100) NOT NULL,
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'open',
  closed_by       UUID,
  closed_at       TIMESTAMPTZ,
  opening_balance_entry_id UUID REFERENCES journal_entries(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_period_tenant_dates UNIQUE (tenant_id, start_date, end_date)
);

-- COA Templates (global, not tenant-scoped)
CREATE TABLE account_templates (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_code   VARCHAR(50) NOT NULL,
  template_name   VARCHAR(200) NOT NULL,
  accounts        JSONB NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_template_code UNIQUE (template_code)
);

-- Indexes
CREATE INDEX idx_accounts_tenant ON accounts (tenant_id);
CREATE INDEX idx_journal_entries_tenant ON journal_entries (tenant_id);
CREATE INDEX idx_journal_entries_date ON journal_entries (tenant_id, entry_date);
CREATE INDEX idx_journal_entries_status ON journal_entries (tenant_id, status);
CREATE INDEX idx_journal_lines_entry ON journal_lines (journal_entry_id);
CREATE INDEX idx_journal_lines_account ON journal_lines (account_id);
CREATE INDEX idx_fiscal_periods_tenant ON fiscal_periods (tenant_id);

-- RLS
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON accounts
  USING (tenant_id = current_tenant_id() OR is_platform_admin());

ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON journal_entries
  USING (tenant_id = current_tenant_id() OR is_platform_admin());

ALTER TABLE journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON journal_lines
  USING (tenant_id = current_tenant_id() OR is_platform_admin());

ALTER TABLE fiscal_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE fiscal_periods FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON fiscal_periods
  USING (tenant_id = current_tenant_id() OR is_platform_admin());

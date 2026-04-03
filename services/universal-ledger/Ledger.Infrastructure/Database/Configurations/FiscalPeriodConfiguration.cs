using Ledger.Domain.Entities;
using Ledger.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Ledger.Infrastructure.Database.Configurations;

public class FiscalPeriodConfiguration : IEntityTypeConfiguration<FiscalPeriod>
{
    public void Configure(EntityTypeBuilder<FiscalPeriod> builder)
    {
        builder.ToTable("fiscal_periods");
        builder.HasKey(p => p.Id);
        builder.Property(p => p.Id).HasColumnName("id");
        builder.Property(p => p.TenantId).HasColumnName("tenant_id").IsRequired();
        builder.Property(p => p.Name).HasColumnName("name").HasMaxLength(100).IsRequired();
        builder.Property(p => p.StartDate).HasColumnName("start_date").IsRequired();
        builder.Property(p => p.EndDate).HasColumnName("end_date").IsRequired();
        builder.Property(p => p.Status).HasColumnName("status")
            .HasConversion(
                v => v.ToString().ToLower(),
                v => Enum.Parse<PeriodStatus>(v, true))
            .IsRequired();
        builder.Property(p => p.ClosedBy).HasColumnName("closed_by");
        builder.Property(p => p.ClosedAt).HasColumnName("closed_at");
        builder.Property(p => p.OpeningBalanceEntryId).HasColumnName("opening_balance_entry_id");
        builder.Property(p => p.CreatedAt).HasColumnName("created_at");
        builder.Property(p => p.UpdatedAt).HasColumnName("updated_at");

        builder.HasIndex(p => p.TenantId).HasDatabaseName("idx_fiscal_periods_tenant");
        builder.HasIndex(p => new { p.TenantId, p.StartDate, p.EndDate }).IsUnique().HasDatabaseName("uq_fiscal_periods_tenant_dates");
    }
}

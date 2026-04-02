using Ledger.Domain.Entities;
using Ledger.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Ledger.Infrastructure.Database.Configurations;

public class JournalEntryConfiguration : IEntityTypeConfiguration<JournalEntry>
{
    public void Configure(EntityTypeBuilder<JournalEntry> builder)
    {
        builder.ToTable("journal_entries");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.Id).HasColumnName("id");
        builder.Property(e => e.TenantId).HasColumnName("tenant_id").IsRequired();
        builder.Property(e => e.EntryDate).HasColumnName("entry_date").IsRequired();
        builder.Property(e => e.Description).HasColumnName("description").IsRequired();
        builder.Property(e => e.Reference).HasColumnName("reference").HasMaxLength(100);
        builder.Property(e => e.Status).HasColumnName("status")
            .HasConversion(
                v => v.ToString().ToLower(),
                v => Enum.Parse<EntryStatus>(v, true))
            .IsRequired();
        builder.Property(e => e.PeriodId).HasColumnName("period_id");
        builder.Property(e => e.PostedBy).HasColumnName("posted_by");
        builder.Property(e => e.PostedAt).HasColumnName("posted_at");
        builder.Property(e => e.ReversedById).HasColumnName("reversed_by_id");
        builder.Property(e => e.ReversalOfId).HasColumnName("reversal_of_id");
        builder.Property(e => e.SourceModule).HasColumnName("source_module").HasMaxLength(100);
        builder.Property(e => e.CreatedAt).HasColumnName("created_at");
        builder.Property(e => e.UpdatedAt).HasColumnName("updated_at");

        builder.HasMany(e => e.Lines).WithOne(l => l.JournalEntry).HasForeignKey(l => l.JournalEntryId);
        builder.HasIndex(e => e.TenantId).HasDatabaseName("idx_journal_entries_tenant");
        builder.HasIndex(e => new { e.TenantId, e.EntryDate }).HasDatabaseName("idx_journal_entries_date");
    }
}

public class JournalLineConfiguration : IEntityTypeConfiguration<JournalLine>
{
    public void Configure(EntityTypeBuilder<JournalLine> builder)
    {
        builder.ToTable("journal_lines");
        builder.HasKey(l => l.Id);
        builder.Property(l => l.Id).HasColumnName("id");
        builder.Property(l => l.JournalEntryId).HasColumnName("journal_entry_id").IsRequired();
        builder.Property(l => l.TenantId).HasColumnName("tenant_id").IsRequired();
        builder.Property(l => l.AccountId).HasColumnName("account_id").IsRequired();
        builder.Property(l => l.DebitAmount).HasColumnName("debit_amount").HasColumnType("decimal(18,4)");
        builder.Property(l => l.CreditAmount).HasColumnName("credit_amount").HasColumnType("decimal(18,4)");
        builder.Property(l => l.Description).HasColumnName("description");
        builder.Property(l => l.CreatedAt).HasColumnName("created_at");

        builder.HasOne(l => l.Account).WithMany().HasForeignKey(l => l.AccountId);
    }
}

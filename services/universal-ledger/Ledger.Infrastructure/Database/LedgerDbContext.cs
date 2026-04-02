using Ledger.Domain.Entities;
using Ledger.Infrastructure.Database.Configurations;
using Microsoft.EntityFrameworkCore;

namespace Ledger.Infrastructure.Database;

public class LedgerDbContext : DbContext
{
    public DbSet<Account> Accounts => Set<Account>();
    public DbSet<JournalEntry> JournalEntries => Set<JournalEntry>();
    public DbSet<JournalLine> JournalLines => Set<JournalLine>();
    public DbSet<FiscalPeriod> FiscalPeriods => Set<FiscalPeriod>();
    public DbSet<AccountTemplate> AccountTemplates => Set<AccountTemplate>();

    public LedgerDbContext(DbContextOptions<LedgerDbContext> options) : base(options) { }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema("ledger");
        modelBuilder.ApplyConfiguration(new AccountConfiguration());
        modelBuilder.ApplyConfiguration(new AccountTemplateConfiguration());
        modelBuilder.ApplyConfiguration(new JournalEntryConfiguration());
        modelBuilder.ApplyConfiguration(new JournalLineConfiguration());
        modelBuilder.ApplyConfiguration(new FiscalPeriodConfiguration());
    }
}

using Ledger.Domain.Entities;
using Ledger.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Ledger.Infrastructure.Database.Configurations;

public class AccountConfiguration : IEntityTypeConfiguration<Account>
{
    public void Configure(EntityTypeBuilder<Account> builder)
    {
        builder.ToTable("accounts");
        builder.HasKey(a => a.Id);
        builder.Property(a => a.Id).HasColumnName("id");
        builder.Property(a => a.TenantId).HasColumnName("tenant_id").IsRequired();
        builder.Property(a => a.Code).HasColumnName("code").HasMaxLength(20).IsRequired();
        builder.Property(a => a.Name).HasColumnName("name").HasMaxLength(200).IsRequired();
        builder.Property(a => a.AccountType).HasColumnName("account_type")
            .HasConversion(
                v => v.ToString().ToLower(),
                v => Enum.Parse<AccountType>(v, true))
            .IsRequired();
        builder.Property(a => a.ParentId).HasColumnName("parent_id");
        builder.Property(a => a.IsActive).HasColumnName("is_active").HasDefaultValue(true);
        builder.Property(a => a.Description).HasColumnName("description");
        builder.Property(a => a.CreatedAt).HasColumnName("created_at");
        builder.Property(a => a.UpdatedAt).HasColumnName("updated_at");

        builder.HasOne(a => a.Parent).WithMany(a => a.Children).HasForeignKey(a => a.ParentId).IsRequired(false);
        builder.HasIndex(a => a.TenantId).HasDatabaseName("idx_accounts_tenant");
    }
}

public class AccountTemplateConfiguration : IEntityTypeConfiguration<AccountTemplate>
{
    public void Configure(EntityTypeBuilder<AccountTemplate> builder)
    {
        builder.ToTable("account_templates");
        builder.HasKey(t => t.Id);
        builder.Property(t => t.Id).HasColumnName("id");
        builder.Property(t => t.TemplateCode).HasColumnName("template_code").HasMaxLength(50).IsRequired();
        builder.Property(t => t.TemplateName).HasColumnName("template_name").HasMaxLength(200).IsRequired();
        builder.Property(t => t.AccountsJson).HasColumnName("accounts").HasColumnType("jsonb").IsRequired();
        builder.Property(t => t.CreatedAt).HasColumnName("created_at");
        builder.HasIndex(t => t.TemplateCode).IsUnique().HasDatabaseName("uq_template_code");
    }
}

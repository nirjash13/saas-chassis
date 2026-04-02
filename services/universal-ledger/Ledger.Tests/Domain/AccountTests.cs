using FluentAssertions;
using Ledger.Domain.Entities;
using Ledger.Domain.Enums;

namespace Ledger.Tests.Domain;

public class AccountTests
{
    [Fact]
    public void Create_ValidParams_ReturnsNewAccount()
    {
        var tenantId = Guid.NewGuid();
        var account  = Account.Create(tenantId, "1001", "Cash", AccountType.Asset);

        account.TenantId.Should().Be(tenantId);
        account.Code.Should().Be("1001");
        account.Name.Should().Be("Cash");
        account.AccountType.Should().Be(AccountType.Asset);
        account.IsActive.Should().BeTrue();
        account.Id.Should().NotBeEmpty();
    }

    [Fact]
    public void Create_WithParent_SetsParentId()
    {
        var parentId = Guid.NewGuid();
        var account  = Account.Create(Guid.NewGuid(), "1001", "Cash", AccountType.Asset, parentId);
        account.ParentId.Should().Be(parentId);
    }

    [Fact]
    public void Update_ValidParams_UpdatesFields()
    {
        var account = Account.Create(Guid.NewGuid(), "1001", "Cash", AccountType.Asset);
        account.Update("Cash in Hand", "Updated description", false);

        account.Name.Should().Be("Cash in Hand");
        account.Description.Should().Be("Updated description");
        account.IsActive.Should().BeFalse();
    }
}

using FluentAssertions;
using Ledger.Domain.Entities;
using Ledger.Domain.Enums;
using Ledger.Domain.Exceptions;

namespace Ledger.Tests.Domain;

public class JournalEntryTests
{
    private static readonly Guid TenantId   = Guid.NewGuid();
    private static readonly Guid AccountId1 = Guid.NewGuid();
    private static readonly Guid AccountId2 = Guid.NewGuid();
    private static readonly Guid UserId     = Guid.NewGuid();

    [Fact]
    public void Post_BalancedEntry_ChangesStatusToPosted()
    {
        var entry = CreateBalancedEntry();
        entry.Post(UserId);
        entry.Status.Should().Be(EntryStatus.Posted);
        entry.PostedBy.Should().Be(UserId);
        entry.PostedAt.Should().NotBeNull();
    }

    [Fact]
    public void Post_UnbalancedEntry_ThrowsUnbalancedEntryException()
    {
        var entry = JournalEntry.Create(TenantId, DateOnly.FromDateTime(DateTime.UtcNow), "Test");
        entry.AddLine(AccountId1, 100m, 0m);
        entry.AddLine(AccountId2, 0m, 50m);

        var act = () => entry.Post(UserId);
        act.Should().Throw<UnbalancedEntryException>();
    }

    [Fact]
    public void Post_AlreadyPostedEntry_ThrowsInvalidOperationException()
    {
        var entry = CreateBalancedEntry();
        entry.Post(UserId);

        var act = () => entry.Post(UserId);
        act.Should().Throw<InvalidOperationException>();
    }

    [Fact]
    public void CreateReversal_PostedEntry_SwapsAmountsAndMarksBothCorrectly()
    {
        var entry = CreateBalancedEntry();
        entry.Post(UserId);

        var reversal = entry.CreateReversal("Correction", UserId);

        reversal.Status.Should().Be(EntryStatus.Posted);
        reversal.ReversalOfId.Should().Be(entry.Id);
        reversal.Lines[0].DebitAmount.Should().Be(entry.Lines[0].CreditAmount);
        reversal.Lines[0].CreditAmount.Should().Be(entry.Lines[0].DebitAmount);
        reversal.IsBalanced.Should().BeTrue();
        entry.Status.Should().Be(EntryStatus.Reversed);
        entry.ReversedById.Should().Be(reversal.Id);
    }

    [Fact]
    public void CreateReversal_AlreadyReversedEntry_ThrowsDuplicateReversalException()
    {
        var entry = CreateBalancedEntry();
        entry.Post(UserId);
        entry.CreateReversal("First reversal", UserId);

        var act = () => entry.CreateReversal("Second reversal", UserId);
        act.Should().Throw<DuplicateReversalException>();
    }

    [Fact]
    public void CreateReversal_DraftEntry_ThrowsInvalidOperationException()
    {
        var entry = CreateBalancedEntry();

        var act = () => entry.CreateReversal("Reason", UserId);
        act.Should().Throw<InvalidOperationException>();
    }

    [Fact]
    public void IsBalanced_EmptyLines_ReturnsFalse()
    {
        var entry = JournalEntry.Create(TenantId, DateOnly.FromDateTime(DateTime.UtcNow), "Test");
        entry.IsBalanced.Should().BeFalse();
    }

    [Fact]
    public void IsBalanced_BalancedLines_ReturnsTrue()
    {
        var entry = CreateBalancedEntry();
        entry.IsBalanced.Should().BeTrue();
        entry.TotalDebits.Should().Be(entry.TotalCredits);
    }

    private static JournalEntry CreateBalancedEntry()
    {
        var entry = JournalEntry.Create(TenantId, DateOnly.FromDateTime(DateTime.UtcNow), "Test entry");
        entry.AddLine(AccountId1, 100m, 0m, "Debit cash");
        entry.AddLine(AccountId2, 0m, 100m, "Credit revenue");
        return entry;
    }
}

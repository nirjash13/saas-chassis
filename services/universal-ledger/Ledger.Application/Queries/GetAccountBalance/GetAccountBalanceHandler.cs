using Ledger.Domain.Enums;
using Ledger.Domain.Interfaces;
using MediatR;

namespace Ledger.Application.Queries.GetAccountBalance;

public class GetAccountBalanceHandler : IRequestHandler<GetAccountBalanceQuery, AccountBalanceDto>
{
    private readonly IAccountRepository _accounts;
    private readonly IJournalEntryRepository _entries;

    public GetAccountBalanceHandler(IAccountRepository accounts, IJournalEntryRepository entries)
    {
        _accounts = accounts;
        _entries = entries;
    }

    public async Task<AccountBalanceDto> Handle(GetAccountBalanceQuery request, CancellationToken cancellationToken)
    {
        var account = await _accounts.GetByIdAsync(request.AccountId, cancellationToken)
            ?? throw new InvalidOperationException($"Account {request.AccountId} not found.");

        var asOfDate = request.AsOfDate ?? DateOnly.FromDateTime(DateTime.UtcNow);
        var entries = await _entries.GetByTenantAsync(request.TenantId, toDate: asOfDate, status: EntryStatus.Posted, cancellationToken: cancellationToken);

        var lines = entries.SelectMany(e => e.Lines).Where(l => l.AccountId == request.AccountId).ToList();
        var totalDebits = lines.Sum(l => l.DebitAmount);
        var totalCredits = lines.Sum(l => l.CreditAmount);

        return new AccountBalanceDto(account.Id, account.Code, account.Name, totalDebits, totalCredits, totalDebits - totalCredits);
    }
}

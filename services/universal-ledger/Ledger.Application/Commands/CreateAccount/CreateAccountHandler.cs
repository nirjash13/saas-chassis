using Ledger.Domain.Entities;
using Ledger.Domain.Interfaces;
using MediatR;

namespace Ledger.Application.Commands.CreateAccount;

public class CreateAccountHandler : IRequestHandler<CreateAccountCommand, Guid>
{
    private readonly IAccountRepository _accounts;

    public CreateAccountHandler(IAccountRepository accounts) => _accounts = accounts;

    public async Task<Guid> Handle(CreateAccountCommand request, CancellationToken cancellationToken)
    {
        var existing = await _accounts.GetByCodeAsync(request.TenantId, request.Code, cancellationToken);
        if (existing != null)
            throw new InvalidOperationException($"Account with code '{request.Code}' already exists.");

        var account = Account.Create(request.TenantId, request.Code, request.Name, request.AccountType, request.ParentId, request.Description);
        await _accounts.AddAsync(account, cancellationToken);
        await _accounts.SaveChangesAsync(cancellationToken);
        return account.Id;
    }
}

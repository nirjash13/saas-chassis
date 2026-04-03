using Ledger.Domain.Entities;
using Ledger.Domain.Interfaces;
using Ledger.Application.Interfaces;
using MediatR;

namespace Ledger.Application.Commands.CreateAccount;

public class CreateAccountHandler : IRequestHandler<CreateAccountCommand, Guid>
{
    private readonly IAccountRepository _accounts;
    private readonly IEventPublisher? _publisher;

    public CreateAccountHandler(IAccountRepository accounts, IEventPublisher? publisher = null)
    {
        _accounts = accounts;
        _publisher = publisher;
    }

    public async Task<Guid> Handle(CreateAccountCommand request, CancellationToken cancellationToken)
    {
        var existing = await _accounts.GetByCodeAsync(request.TenantId, request.Code, cancellationToken);
        if (existing != null)
            throw new InvalidOperationException($"Account with code '{request.Code}' already exists.");

        var account = Account.Create(request.TenantId, request.Code, request.Name, request.AccountType, request.ParentId, request.Description);
        await _accounts.AddAsync(account, cancellationToken);
        await _accounts.SaveChangesAsync(cancellationToken);

        if (_publisher != null)
        {
            await _publisher.PublishAsync("chassis.ledger", "account.created", new {
                TenantId = account.TenantId,
                AccountId = account.Id,
                Code = account.Code,
                Name = account.Name,
                AccountType = account.AccountType.ToString()
            }, cancellationToken);
        }

        return account.Id;
    }
}

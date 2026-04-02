using Ledger.Domain.Enums;
using MediatR;

namespace Ledger.Application.Commands.CreateAccount;

public record CreateAccountCommand(
    Guid TenantId,
    string Code,
    string Name,
    AccountType AccountType,
    Guid? ParentId,
    string? Description
) : IRequest<Guid>;

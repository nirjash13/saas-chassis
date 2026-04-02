using MediatR;

namespace Ledger.Application.Commands.CreateFiscalPeriod;

public record CreateFiscalPeriodCommand(
    Guid TenantId,
    string Name,
    DateOnly StartDate,
    DateOnly EndDate
) : IRequest<Guid>;

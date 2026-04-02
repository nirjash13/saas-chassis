using Ledger.Domain.Entities;
using Ledger.Domain.Interfaces;
using MediatR;

namespace Ledger.Application.Commands.CreateFiscalPeriod;

public class CreateFiscalPeriodHandler : IRequestHandler<CreateFiscalPeriodCommand, Guid>
{
    private readonly IFiscalPeriodRepository _periods;

    public CreateFiscalPeriodHandler(IFiscalPeriodRepository periods) => _periods = periods;

    public async Task<Guid> Handle(CreateFiscalPeriodCommand request, CancellationToken cancellationToken)
    {
        var period = FiscalPeriod.Create(request.TenantId, request.Name, request.StartDate, request.EndDate);
        await _periods.AddAsync(period, cancellationToken);
        await _periods.SaveChangesAsync(cancellationToken);
        return period.Id;
    }
}

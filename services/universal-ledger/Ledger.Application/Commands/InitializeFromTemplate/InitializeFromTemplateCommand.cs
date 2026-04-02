using MediatR;

namespace Ledger.Application.Commands.InitializeFromTemplate;

public record InitializeFromTemplateCommand(Guid TenantId, string TemplateCode) : IRequest<int>;

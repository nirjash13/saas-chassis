using FluentValidation;

namespace Ledger.Application.Commands.CreateJournalEntry;

public class CreateJournalEntryValidator : AbstractValidator<CreateJournalEntryCommand>
{
    public CreateJournalEntryValidator()
    {
        RuleFor(x => x.TenantId).NotEmpty();
        RuleFor(x => x.Description).NotEmpty().MaximumLength(500);
        RuleFor(x => x.Lines).NotEmpty().WithMessage("Journal entry must have at least one line.");
        RuleForEach(x => x.Lines).ChildRules(line =>
        {
            line.RuleFor(l => l.AccountId).NotEmpty();
            line.RuleFor(l => l)
                .Must(l => (l.DebitAmount > 0 && l.CreditAmount == 0) || (l.CreditAmount > 0 && l.DebitAmount == 0))
                .WithMessage("Each line must have either a debit or a credit amount, not both.");
        });
    }
}

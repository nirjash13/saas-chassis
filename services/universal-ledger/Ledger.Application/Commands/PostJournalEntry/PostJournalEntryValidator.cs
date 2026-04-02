using FluentValidation;

namespace Ledger.Application.Commands.PostJournalEntry;

public class PostJournalEntryValidator : AbstractValidator<PostJournalEntryCommand>
{
    public PostJournalEntryValidator()
    {
        RuleFor(x => x.EntryId).NotEmpty();
        RuleFor(x => x.PostedByUserId).NotEmpty();
    }
}

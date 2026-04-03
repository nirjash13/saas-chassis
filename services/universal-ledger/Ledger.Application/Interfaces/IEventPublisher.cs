namespace Ledger.Application.Interfaces;

public interface IEventPublisher
{
    Task PublishAsync<T>(string exchange, string routingKey, T @event, CancellationToken ct = default);
}

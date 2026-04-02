using System.Text;
using System.Text.Json;
using RabbitMQ.Client;

namespace Ledger.Infrastructure.Messaging;

public interface IEventPublisher
{
    Task PublishAsync<T>(string exchange, string routingKey, T @event, CancellationToken ct = default);
}

public class RabbitMqPublisher : IEventPublisher, IDisposable
{
    private readonly IConnection _connection;
    private readonly IModel _channel;

    public RabbitMqPublisher(string connectionString)
    {
        var factory = new ConnectionFactory { Uri = new Uri(connectionString) };
        _connection = factory.CreateConnection();
        _channel = _connection.CreateModel();
        _channel.ExchangeDeclare("chassis.ledger", ExchangeType.Topic, durable: true);
    }

    public Task PublishAsync<T>(string exchange, string routingKey, T @event, CancellationToken ct = default)
    {
        var body = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(@event));
        var props = _channel.CreateBasicProperties();
        props.Persistent = true;
        props.ContentType = "application/json";
        _channel.BasicPublish(exchange, routingKey, props, body);
        return Task.CompletedTask;
    }

    public void Dispose()
    {
        _channel?.Dispose();
        _connection?.Dispose();
    }
}

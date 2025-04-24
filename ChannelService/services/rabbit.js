import amqplib from "amqplib";

class EventBus {
  constructor() {
    this.connection = null;
    this.channel = null;
    this.retryCount = 0;
    this.maxRetries = 5;
  }

  async connect() {
    try {
      this.connection = await amqplib.connect(process.env.RABBITMQ_URL, {
        heartbeat: 30,
      });

      this.channel = await this.connection.createChannel();

      // Configure prefetch
      await this.channel.prefetch(1);

      // Error handlers
      this.connection.on("close", () => {
        console.log("RabbitMQ connection closed, reconnecting...");
        this.retryConnect();
      });

      this.connection.on("error", (err) => {
        console.error("RabbitMQ connection error:", err);
      });

      console.log("✅ Connected to RabbitMQ");
      this.retryCount = 0;
      return true;
    } catch (error) {
      console.error("❌ RabbitMQ connection failed:", error);
      this.retryConnect();
      throw error;
    }
  }

  async retryConnect() {
    if (this.retryCount >= this.maxRetries) {
      console.error("Max connection retries reached");
      return;
    }

    this.retryCount++;
    const delay = Math.min(5000, this.retryCount * 1000);

    console.log(
      `Retrying connection in ${delay}ms (attempt ${this.retryCount})`
    );
    setTimeout(() => this.connect(), delay);
  }

  async publish(exchange, routingKey, message, options = {}) {
    try {
      await this.channel.assertExchange(exchange, "topic", { durable: true });
      this.channel.publish(
        exchange,
        routingKey,
        Buffer.from(JSON.stringify(message)),
        {
          persistent: true,
          ...options,
        }
      );
    } catch (error) {
      console.error("Publish failed:", error);
      throw error;
    }
  }

  async subscribe(exchange, queue, routingKey, handler) {
    try {
      await this.channel.assertExchange(exchange, "topic", { durable: true });
      const q = await this.channel.assertQueue(queue, {
        durable: true,
        arguments: {
          "x-dead-letter-exchange": `${exchange}.dead`,
          "x-dead-letter-routing-key": routingKey,
        },
      });

      await this.channel.bindQueue(q.queue, exchange, routingKey);

      this.channel.consume(q.queue, async (msg) => {
        try {
          const data = JSON.parse(msg.content.toString());
          await handler(data);
          this.channel.ack(msg);
        } catch (error) {
          console.error("Message processing failed:", error);
          this.channel.nack(msg, false, false); // Reject message
        }
      });

      console.log(`Subscribed to ${exchange}:${routingKey}`);
    } catch (error) {
      console.error("Subscription failed:", error);
      throw error;
    }
  }
}

export const eventBus = new EventBus();

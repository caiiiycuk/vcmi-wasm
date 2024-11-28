//
// Created by caiiiycuk on 20.11.24.
//
#include "StdInc.h"
#include "../NetworkHandler.h"

#include "CThreadHelper.h"

VCMI_LIB_NAMESPACE_BEGIN

enum HTML5NetworkCommandType {
	IDLE,
	SERVER_CONNECT,
	CLIENT_CONNECT,
	SERVER_TO_CLIENT,
	CLIENT_TO_SERVER,
};

struct HTML5NetworkCommand {
	HTML5NetworkCommandType type = IDLE;
	std::vector<std::byte> message = {};
};

class HTML5ServerConnection;
class HTML5ClientConnection;

struct HTML5NetworkTimeout {
	INetworkTimerListener& listener;
	std::chrono::milliseconds executeAt;
};

struct HTML5NetworkLoop {
	boost::mutex loopMutex;
	boost::atomic_bool alive = true;
	std::shared_ptr<HTML5ClientConnection> client;
	std::shared_ptr<HTML5ServerConnection> server;
	std::list<HTML5NetworkCommand> commands;
	std::list<HTML5NetworkTimeout> timeouts;
};


namespace {
	std::shared_ptr<HTML5NetworkLoop> loop = nullptr;

	std::chrono::milliseconds now() {
		return std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::system_clock::now().time_since_epoch());
	}

	void pushLoopCommand(std::shared_ptr<HTML5NetworkLoop>& loop, HTML5NetworkCommandType type, const std::vector<std::byte>& message) {
		boost::mutex::scoped_lock lock(loop->loopMutex);
		loop->commands.push_back({
			type, message
		});
	}
}

class HTML5ClientConnection final : public INetworkConnection, public std::enable_shared_from_this<HTML5ClientConnection> {
	std::shared_ptr<HTML5NetworkLoop> loop;
public:
	INetworkClientListener& listener;
	HTML5ClientConnection(std::shared_ptr<HTML5NetworkLoop> &loop, INetworkClientListener &listener) : loop(loop), listener(listener) {
	}

	void sendPacket(const std::vector<std::byte> &message) override {
		// logNetwork->info(std::string("(server -> client) packet:") + std::to_string(message.size()));
		pushLoopCommand(loop, SERVER_TO_CLIENT, message);
	}

	void setAsyncWritesEnabled(bool on) override {
	}

	void close() override {
		loop->alive = false;
		loop->client.reset();
	}
};

class HTML5ServerConnection final : public INetworkConnection, public std::enable_shared_from_this<HTML5ServerConnection> {
	std::shared_ptr<HTML5NetworkLoop> loop;
public:
	INetworkServerListener& listener;
	HTML5ServerConnection(std::shared_ptr<HTML5NetworkLoop>& loop, INetworkServerListener &listener) : loop(loop), listener(listener) {
	}

	void sendPacket(const std::vector<std::byte> &message) override {
		// logNetwork->info(std::string("(client -> server) packet:") + std::to_string(message.size()));
		pushLoopCommand(loop, CLIENT_TO_SERVER, message);
	}

	void setAsyncWritesEnabled(bool on) override {
	}

	void close() override {
		loop->alive = false;
		loop->server.reset();
	}
};


class HTML5NetworkServer : public INetworkConnectionListener, public INetworkServer {
	std::shared_ptr<HTML5NetworkLoop> loop;
public:
	HTML5NetworkServer(std::shared_ptr<HTML5NetworkLoop>& loop): loop(loop) {
	}
	~HTML5NetworkServer() {
		loop->alive = false;
	}

	void start(uint16_t port) override {
		logNetwork->info("HTML5 loop server started on " + std::to_string(port));
		std::shared_ptr<HTML5NetworkLoop> loop = this->loop;
		boost::thread processor([loop]() {
			setThreadName("HTTP5 loop server");
			HTML5NetworkCommand command;
			while (loop->alive) {
				command.type = IDLE;
				std::vector<INetworkTimerListener*> timersToRun;
				{
					boost::mutex::scoped_lock lock(loop->loopMutex);
					if (!loop->commands.empty()) {
						command = std::move(loop->commands.front());
						loop->commands.pop_front();
					}

					auto nowMs = now();
					auto it = loop->timeouts.begin();
					while (it != loop->timeouts.end()) {
						if (it->executeAt >= nowMs) {
							timersToRun.push_back(&it->listener);
							it = loop->timeouts.erase(it);
						} else {
							++it;
						}
					}
				}
				for (const auto timer : timersToRun) {
					timer->onTimer();
				}

				switch (command.type) {
					case IDLE:
						break;
					case SERVER_CONNECT:
						loop->server->listener.onNewConnection(loop->client);
					break;
					case CLIENT_CONNECT:
						loop->client->listener.onConnectionEstablished(loop->server);
						break;
					case SERVER_TO_CLIENT:
						if (loop->alive && loop->client) {
							loop->client->listener.onPacketReceived(loop->client->shared_from_this(), command.message);
						}
						break;
					case CLIENT_TO_SERVER:
						if (loop->alive && loop->server) {
							loop->server->listener.onPacketReceived(loop->client->shared_from_this(), command.message);
						}
						break;
				}
			}

			loop->server.reset();
			loop->client.reset();
		});
	}

	void onDisconnected(const std::shared_ptr<INetworkConnection> &connection,
		const std::string &errorMessage) override {
		abort();
	}

	void onPacketReceived(const std::shared_ptr<INetworkConnection> &connection,
		const std::vector<std::byte> &message) override {
		abort();
	}
};

class HTML5NetworkHandler : public INetworkHandler
{
public:
	HTML5NetworkHandler() = default;

	std::unique_ptr<INetworkServer> createServerTCP(INetworkServerListener & listener) override {
		logNetwork->info("Create a new server loop");
		loop = std::make_shared<HTML5NetworkLoop>();
		loop->server = std::make_shared<HTML5ServerConnection>(loop, listener);
		return std::make_unique<HTML5NetworkServer>(loop);
	}

	void connectToRemote(INetworkClientListener & listener, const std::string & host, uint16_t port) override {
		if (loop && loop->alive) {
			logNetwork->info("Client attached to the loop");
			loop->client = std::make_shared<HTML5ClientConnection>(loop, listener);
			pushLoopCommand(loop, SERVER_CONNECT, {});
			pushLoopCommand(loop, CLIENT_CONNECT, {});
		} else {
			assert(false);
		}
	}

	void createTimer(INetworkTimerListener & listener, std::chrono::milliseconds duration) override {
		if (loop && loop->alive) {
			boost::mutex::scoped_lock lock(loop->loopMutex);
			loop->timeouts.push_back({ listener, now() + duration });
		} else {
			assert(false);
		}
	}

	void run() override {

	}

	void stop() override {

	}
};

#if 1
std::unique_ptr<INetworkHandler> INetworkHandler::createHandler()
{
	return std::make_unique<HTML5NetworkHandler>();
}
#endif

VCMI_LIB_NAMESPACE_END

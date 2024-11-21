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

struct HTML5NetworkTimer {
	INetworkTimerListener& listener;
	std::chrono::milliseconds duration;
	size_t runCount;
};

struct HTML5NetworkLoop {
	boost::mutex loopMutex;
	std::shared_ptr<HTML5ClientConnection> client;
	std::shared_ptr<HTML5ServerConnection> server;
	std::list<HTML5NetworkCommand> commands;
	std::list<HTML5NetworkTimer> timers;
};


namespace {
	HTML5NetworkLoop loop;
}

void pushLoopCommand(HTML5NetworkLoop& loop, HTML5NetworkCommandType type, const std::vector<std::byte>& message) {
	boost::mutex::scoped_lock lock(loop.loopMutex);
	loop.commands.push_back({
		type, message
	});
}

class HTML5ClientConnection final : public INetworkConnection, public std::enable_shared_from_this<HTML5ClientConnection> {
	HTML5NetworkLoop& loop;
public:
	INetworkClientListener& listener;
	HTML5ClientConnection(HTML5NetworkLoop &loop, INetworkClientListener &listener) : loop(loop), listener(listener) {
	}

	void sendPacket(const std::vector<std::byte> &message) override {
		logNetwork->info(std::string("(server -> client) packet:") + std::to_string(message.size()));
		pushLoopCommand(loop, SERVER_TO_CLIENT, message);
	}

	void setAsyncWritesEnabled(bool on) override {
	}

	void close() override {
		loop.client.reset();
	}
};

class HTML5ServerConnection final : public INetworkConnection, public std::enable_shared_from_this<HTML5ServerConnection> {
	HTML5NetworkLoop& loop;
public:
	INetworkServerListener& listener;
	HTML5ServerConnection(HTML5NetworkLoop &loop, INetworkServerListener &listener) : loop(loop), listener(listener) {
	}

	void sendPacket(const std::vector<std::byte> &message) override {
		logNetwork->info(std::string("(client -> server) packet:") + std::to_string(message.size()));
		pushLoopCommand(loop, CLIENT_TO_SERVER, message);
	}

	void setAsyncWritesEnabled(bool on) override {
	}

	void close() override {
	}
};


class HTML5NetworkServer : public INetworkConnectionListener, public INetworkServer {
	bool alive;
	HTML5NetworkLoop& loop;
public:
	HTML5NetworkServer(HTML5NetworkLoop& loop): alive(true), loop(loop) {
	}
	~HTML5NetworkServer() {
		alive = false;
	}

	void start(uint16_t port) override {
		logNetwork->info("HTML5 loop server started on " + std::to_string(port));
		boost::thread processor([this]() {
			setThreadName("HTTP5 loop server");
			HTML5NetworkCommand command;
			std::chrono::milliseconds baseMs =
				std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::system_clock::now().time_since_epoch());
			while (alive) {
				command.type = IDLE;
				{
					boost::mutex::scoped_lock lock(loop.loopMutex);
					if (!loop.commands.empty()) {
						command = std::move(loop.commands.front());
						loop.commands.pop_front();
					}

					std::chrono::milliseconds nowMs =
						std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::system_clock::now().time_since_epoch());
					std::chrono::milliseconds passedMs = nowMs - baseMs;
					size_t maxMs = 0;
					for (auto &timer : loop.timers) {
						if ((timer.runCount + 1) * timer.duration.count() > passedMs.count()) {
							timer.listener.onTimer();
							timer.runCount++;
						}
						if (timer.duration.count() > maxMs) {
							maxMs = timer.duration.count();
						}
					}
					if (maxMs > passedMs.count()) {
						for (auto &timer : loop.timers) {
							timer.runCount = 0;
						}
						baseMs = nowMs;
					}
				}
				switch (command.type) {
					case IDLE:
						break;
					case SERVER_CONNECT:
						loop.server->listener.onNewConnection(loop.client);
					break;
					case CLIENT_CONNECT:
						loop.client->listener.onConnectionEstablished(loop.server);
						break;
					case SERVER_TO_CLIENT:
						if (loop.client) {
							loop.client->listener.onPacketReceived(loop.client->shared_from_this(), command.message);
						}
						break;
					case CLIENT_TO_SERVER:
						if (loop.server) {
							loop.server->listener.onPacketReceived(loop.client->shared_from_this(), command.message);
						}
						break;
				}
			}
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
		logNetwork->info("ServerListener set");
		loop.server = std::make_shared<HTML5ServerConnection>(loop, listener);
		return std::make_unique<HTML5NetworkServer>(loop);
	}

	void connectToRemote(INetworkClientListener & listener, const std::string & host, uint16_t port) override {
		logNetwork->info("ClientListener set");
		loop.client = std::make_shared<HTML5ClientConnection>(loop, listener);
		pushLoopCommand(loop, SERVER_CONNECT, {});
		pushLoopCommand(loop, CLIENT_CONNECT, {});
	}

	void createTimer(INetworkTimerListener & listener, std::chrono::milliseconds duration) override {
		boost::mutex::scoped_lock lock(loop.loopMutex);
		loop.timers.push_back({ listener, duration, 0 });
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

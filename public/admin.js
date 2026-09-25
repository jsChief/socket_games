// Admin panel client. Talks to the JSON API at /admin/api (mounted in server.js).
// Handles: login, dashboard, live players/rooms, user & admin management, stats,
// broadcasting announcements and reading server logs. Data auto-refreshes.
(function () {
  var API = "/admin/api";

  var app = new Vue({
    el: "#admin-app",
    data: {
      loggedIn: false,
      token: "",
      admin: { username: "", role: "" },
      login: { username: "", password: "", busy: false, error: "" },
      tab: "dashboard",
      clock: "",
      refreshing: false,
      tabs: [
        { id: "dashboard", label: "Dashboard", icon: "fa fa-tachometer-alt" },
        { id: "live", label: "Live", icon: "fa fa-broadcast-tower" },
        { id: "users", label: "Users", icon: "fa fa-address-book" },
        { id: "stats", label: "Stats", icon: "fa fa-trophy" },
        { id: "broadcast", label: "Broadcast", icon: "fa fa-bullhorn" },
        { id: "logs", label: "Logs", icon: "fa fa-terminal" },
      ],
      overview: {
        onlineCount: 0,
        botCount: 0,
        roomCount: 0,
        roomsInGame: 0,
        accountCount: 0,
        adminCount: 0,
        gamesPlayed: 0,
        playerStatsCount: 0,
        uptimeSeconds: 0,
        nodeVersion: "",
        platform: "",
        arch: "",
        memoryMB: 0,
        logCount: 0,
        resetCodesActive: 0,
        lastAnnouncement: null,
      },
      onlinePlayers: [],
      rooms: [],
      users: [],
      admins: [],
      leaderboard: [],
      statsGamesPlayed: 0,
      logs: [],
      audit: [],
      announcements: [],
      announceText: "",
      announceBusy: false,
      logLevel: "all",
      logSearch: "",
      statsSearch: "",
      statsSort: "wins",
      modal: { type: null },
      toasts: [],
      light: false,
    },
    computed: {
      isRoot() {
        return this.admin.role === "root";
      },
      memoryPercent() {
        var m = this.overview.memoryMB;
        return Math.min(100, Math.max(4, Math.round((m / 2048) * 100)));
      },
      filteredLogs() {
        var q = this.logSearch.trim().toLowerCase();
        return this.logs.filter(function (l) {
          if (this.logLevel !== "all" && l.level !== this.logLevel) return false;
          if (q && l.text.toLowerCase().indexOf(q) === -1) return false;
          return true;
        }, this);
      },
      filteredLeaderboard() {
        var q = this.statsSearch.trim().toLowerCase();
        var sort = this.statsSort;
        var list = this.leaderboard.filter(function (p) {
          return !q || String(p.name).toLowerCase().indexOf(q) !== -1;
        });
        list.sort(function (a, b) {
          if (sort === "name") return String(a.name).localeCompare(String(b.name));
          if (sort === "total") return b.total - a.total || b.wins - a.wins;
          if (sort === "winRate") return b.winRate - a.winRate || b.wins - a.wins;
          return b.wins - a.wins || b.winRate - a.winRate;
        });
        return list;
      },
    },
    methods: {
      toast(message, type) {
        type = type || "info";
        var id = Date.now() + Math.random();
        var toast = { id: id, message: message, type: type, leaving: false };
        var self = this;
        this.toasts.push(toast);
        setTimeout(function () {
          toast.leaving = true; // trigger the slide-out/fade-out animation
          setTimeout(function () {
            self.toasts = self.toasts.filter(function (t) {
              return t.id !== id;
            });
          }, 330); // just after the 0.3s toast-out animation
        }, 3000);
      },
      api(path, opts) {
        opts = opts || {};
        var self = this;
        var headers = Object.assign({}, opts.headers || {});
        if (this.token) headers.Authorization = "Bearer " + this.token;
        if (opts.body !== undefined) headers["Content-Type"] = "application/json";
        var url = API + path;
        var method = opts.method || (opts.body !== undefined ? "POST" : "GET");
        var body = opts.body !== undefined ? JSON.stringify(opts.body) : undefined;
        return fetch(url, { method: method, headers: headers, body: body })
          .then(function (r) {
            return r
              .json()
              .then(function (data) {
                return { status: r.status, data: data };
              })
              .catch(function () {
                return { status: r.status, data: { error: "Bad response from server." } };
              });
          })
          .then(function (res) {
            if (res.status === 401) {
              self.sessionExpired();
              throw new Error("Session expired — please sign in again.");
            }
            if (!res.ok && typeof res.data.error !== "undefined") {
              var err = new Error(res.data.error || "Request failed (" + res.status + ")");
              err.status = res.status;
              throw err;
            }
            return res.data;
          });
      },
      sessionExpired() {
        this.token = "";
        localStorage.removeItem("adminToken");
        this.loggedIn = false;
        this.closeModal();
        this.toast("Your session expired. Please sign in again.", "error");
      },
      doLogin() {
        var self = this;
        var u = this.login.username.trim();
        if (!u || !this.login.password) {
          this.login.error = "Enter your username and password.";
          return;
        }
        this.login.busy = true;
        this.login.error = "";
        this
          .api("/login", { body: { username: u, password: this.login.password } })
          .then(function (data) {
            self.token = data.token;
            self.admin = { username: data.username, role: data.role || "admin" };
            localStorage.setItem("adminToken", data.token);
            self.loggedIn = true;
            self.login.password = "";
            self.toast("Welcome back, " + data.username + "!", "success");
            self.refreshAll();
          })
          .catch(function (e) {
            self.login.error = e.message;
          })
          .then(function () {
            self.login.busy = false;
          });
      },
      logout() {
        this.api("/logout", { method: "POST", body: {} }).catch(function () {});
        localStorage.removeItem("adminToken");
        this.token = "";
        this.loggedIn = false;
      },
      selectTab(id) {
        this.tab = id;
        if (id === "live") this.loadPlayers();
        if (id === "rooms") this.loadRooms();
        if (id === "users") this.loadUsers();
        if (id === "stats") this.loadStats();
        if (id === "logs") this.loadLogs();
        this.loadOverview();
      },
      refreshAll() {
        var self = this;
        this.refreshing = true;
        this.loadOverview();
        this.loadPlayers();
        this.loadRooms();
        this.loadUsers();
        this.loadStats();
        this.loadAdmins();
        this.loadAudit();
        this.loadLogs();
        setTimeout(function () {
          self.refreshing = false;
        }, 600);
      },
      loadOverview() {
        var self = this;
        this
          .api("/overview")
          .then(function (d) {
            self.overview = Object.assign({}, self.overview, d);
          })
          .catch(function () {});
      },
      loadPlayers() {
        var self = this;
        this
          .api("/players")
          .then(function (d) {
            self.onlinePlayers = d.players || [];
          })
          .catch(function () {});
      },
      loadRooms() {
        var self = this;
        this
          .api("/rooms")
          .then(function (d) {
            self.rooms = d.rooms || [];
          })
          .catch(function () {});
      },
      loadUsers() {
        var self = this;
        this
          .api("/users")
          .then(function (d) {
            self.users = d.users || [];
          })
          .catch(function () {});
      },
      loadStats() {
        var self = this;
        this
          .api("/stats")
          .then(function (d) {
            self.statsGamesPlayed = d.gamesPlayed || 0;
            self.leaderboard = d.leaderboard || [];
          })
          .catch(function () {});
      },
      loadAdmins() {
        var self = this;
        this
          .api("/admins")
          .then(function (d) {
            self.admins = d.admins || [];
          })
          .catch(function () {});
      },
      loadAudit() {
        var self = this;
        this
          .api("/audit")
          .then(function (d) {
            self.audit = d.audit || [];
          })
          .catch(function () {});
      },
      loadLogs() {
        var self = this;
        this
          .api("/logs")
          .then(function (d) {
            self.logs = d.logs || [];
          })
          .catch(function () {});
      },
      tick() {
        this.loadOverview();
        if (this.tab === "live") {
          this.loadPlayers();
          this.loadRooms();
        }
      },
      // ----- actions -----
      closeRoom(room, reason) {
        var self = this;
        var text = reason;
        if (!window.confirm("Close room " + room.code + " and send everyone back to the lobby?")) return;
        this
          .api("/rooms/" + encodeURIComponent(room.code) + "/close", { body: { reason: text } })
          .then(function (d) {
            self.toast("Room " + room.code + " closed.", "success");
            self.loadRooms();
            self.loadOverview();
          })
          .catch(function (e) {
            self.toast(e.message + " (room " + room.code + ")", "error");
          });
      },
      kickPlayer(p) {
        var self = this;
        if (!window.confirm("Kick " + p.name + " back to the lobby?")) return;
        this
          .api("/players/kick", { body: { socketId: p.id } })
          .then(function (d) {
            self.toast("Kicked " + p.name + ".", "success");
            self.loadPlayers();
            self.loadOverview();
          })
          .catch(function (e) {
            self.toast(e.message, "error");
          });
      },
      openMessageModal(player) {
        this.modal = { type: "message-player", player: player, message: "", error: "" };
      },
      sendPlayerMessage() {
        var self = this;
        var m = this.modal;
        if (!m.message.trim()) {
          m.error = "Message cannot be empty.";
          return;
        }
        if (m.message.length > 500) {
          m.error = "Message is too long (max 500 characters).";
          return;
        }
        this
          .api("/players/message", { body: { socketId: m.player.id, message: m.message } })
          .then(function (d) {
            self.toast("Message sent to " + m.player.name + ".", "success");
            self.closeModal();
          })
          .catch(function (e) {
            m.error = e.message;
          });
      },
      // ----- user management -----
      openResetCodeModal(user) {
        var self = this;
        this
          .api("/users/reset-code", { body: { username: user.username } })
          .then(function (d) {
            self.modal = { type: "reset-code", user: user, code: d.code, expiresIn: d.expiresInMinutes };
          })
          .catch(function (e) {
            self.toast(e.message, "error");
          });
      },
      copyCode() {
        var self = this;
        var code = this.modal && this.modal.code;
        if (!code) return;
        var done = function () {
          self.toast("Reset code copied to clipboard.", "success");
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(code).then(done).catch(done);
        } else {
          done();
        }
      },
      openResetPwModal(user) {
        this.modal = { type: "reset-pw", user: user, newPassword: "", confirmPassword: "", error: "" };
      },
      resetPassword() {
        var self = this;
        var m = this.modal;
        if (!m.newPassword || m.newPassword.length < 4) {
          m.error = "Password must be at least 4 characters.";
          return;
        }
        if (m.newPassword !== m.confirmPassword) {
          m.error = "Passwords do not match.";
          return;
        }
        this
          .api("/users/reset-password", { body: { username: m.user.username, newPassword: m.newPassword } })
          .then(function (d) {
            self.toast("Password reset for " + d.username + ".", "success");
            self.closeModal();
            self.loadUsers();
          })
          .catch(function (e) {
            m.error = e.message;
          });
      },
      openDeleteUserModal(user) {
        this.modal = { type: "delete-user", user: user };
      },
      deleteUser() {
        var self = this;
        var u = this.modal && this.modal.user;
        if (!u) return;
        this
          .api("/users/" + encodeURIComponent(u.username), { method: "DELETE" })
          .then(function (d) {
            self.toast("Deleted account " + d.username + ".", "success");
            self.closeModal();
            self.loadUsers();
            self.loadOverview();
            self.loadStats();
          })
          .catch(function (e) {
            self.toast(e.message, "error");
          });
      },
      // ----- admin management -----
      openAddAdminModal() {
        this.modal = { type: "add-admin", username: "", password: "", role: "admin", error: "" };
      },
      addAdmin() {
        var self = this;
        var m = this.modal;
        var u = m.username.trim();
        if (!u) {
          m.error = "Username is required.";
          return;
        }
        if (!m.password || m.password.length < 4) {
          m.error = "Password must be at least 4 characters.";
          return;
        }
        this
          .api("/admins", { body: { username: u, password: m.password, role: m.role } })
          .then(function (d) {
            self.toast("Admin " + d.username + " created (" + d.role + ").", "success");
            self.closeModal();
            self.loadAdmins();
          })
          .catch(function (e) {
            m.error = e.message;
          });
      },
      openResetAdminPwModal(adminUser) {
        this.modal = { type: "reset-admin-pw", admin: adminUser, newPassword: "", error: "" };
      },
      resetAdminPassword() {
        var self = this;
        var m = this.modal;
        if (!m.newPassword || m.newPassword.length < 4) {
          m.error = "Password must be at least 4 characters.";
          return;
        }
        this
          .api("/admins/reset-password", { body: { username: m.admin.username, newPassword: m.newPassword } })
          .then(function (d) {
            self.toast("Password reset for " + d.username + ".", "success");
            self.closeModal();
            self.loadAdmins();
          })
          .catch(function (e) {
            m.error = e.message;
          });
      },
      openDeleteAdminModal(adminUser) {
        this.modal = { type: "delete-admin", admin: adminUser };
      },
      deleteAdmin() {
        var self = this;
        var a = this.modal && this.modal.admin;
        if (!a) return;
        this
          .api("/admins/" + encodeURIComponent(a.username), { method: "DELETE" })
          .then(function (d) {
            self.toast("Removed admin " + d.username + ".", "success");
            self.closeModal();
            self.loadAdmins();
            self.loadOverview();
          })
          .catch(function (e) {
            self.toast(e.message, "error");
          });
      },
      // ----- broadcast -----
      sendAnnounce() {
        var self = this;
        var text = this.announceText.trim();
        if (!text) return;
        this.announceBusy = true;
        this
          .api("/announce", { body: { message: text } })
          .then(function () {
            self.announcements.push({ text: text, at: Date.now() });
            self.announceText = "";
            self.toast("Announcement broadcast to all online players.", "success");
            self.loadOverview();
          })
          .catch(function (e) {
            self.toast(e.message, "error");
          })
          .then(function () {
            self.announceBusy = false;
          });
      },
      clearLogs() {
        var self = this;
        if (!window.confirm("Clear the in-memory log buffer?")) return;
        this
          .api("/logs", { method: "DELETE" })
          .then(function () {
            self.logs = [];
            self.toast("Logs cleared.", "success");
          })
          .catch(function (e) {
            self.toast(e.message, "error");
          });
      },
      // ----- modal / helpers -----
      closeModal() {
        this.modal = { type: null };
      },
      toggleMode() {
        this.light = !this.light;
        localStorage.setItem("adminMode", this.light ? "light" : "dark");
        document.body.classList.toggle("light", this.light);
      },
      shortId(id) {
        if (!id) return "—";
        return String(id).slice(0, 8) + "…";
      },
      formatUptime(seconds) {
        seconds = seconds || 0;
        var d = Math.floor(seconds / 86400);
        var h = Math.floor((seconds % 86400) / 3600);
        var m = Math.floor((seconds % 3600) / 60);
        var s = seconds % 60;
        var parts = [];
        if (d) parts.push(d + "d");
        if (h) parts.push(h + "h");
        if (m) parts.push(m + "m");
        parts.push(s + "s");
        return parts.join(" ");
      },
      formatTime(t) {
        if (!t) return "—";
        var d = new Date(t);
        var pad = function (n) {
          return n < 10 ? "0" + n : "" + n;
        };
        return (
          pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds())
        );
      },
      tickClock() {
        this.clock = new Date().toLocaleTimeString();
      },
    },
    mounted() {
      var self = this;
      // Sync with the class the inline script may already have applied.
      this.light = document.body.classList.contains("light");
      var saved = localStorage.getItem("adminToken");
      if (saved) {
        this.token = saved;
        this
          .api("/session")
          .then(function (s) {
            self.admin = { username: s.username, role: s.role || "admin" };
            self.loggedIn = true;
            self.refreshAll();
          })
          .catch(function () {
            // api() already handled the 401 case
          });
      }
      this.tickClock();
      setInterval(function () {
        self.tickClock();
      }, 1000);
      setInterval(function () {
        if (self.loggedIn) self.tick();
      }, 5000);
    },
  });
})();
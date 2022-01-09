$(function () {

    let current_theme = localStorage.getItem("theme");

    if (current_theme === null) {
        current_theme = 0;
    }

    set_theme(current_theme);

    $("#theme-button").click(
        () => {
            current_theme = (current_theme + 1) % 3;
            localStorage.setItem("theme", current_theme);
            set_theme(current_theme);
        }
    );

    $("#help-button").click(
        () => {
            $("#help_modal").modal("show");
        }
    );

    $("#calibrate-button").click(
        () => {
            alert(
                "Calibration in Progress\n\n" +
                "If a dialogue appears, check all the \"Always open in Discord\" boxes before proceeding.\n\n" +
                "You are calibrated if a popup appears without the dialogue, and Discord opens to the friends list."
            );
            test_link();
        }
    );

    $("#logout-button").click(
        () => {
            localStorage.clear();
            redirect_to_login();
        }
    );

    let uri = `${window.location.hostname}:${window.location.port}`;

    get_api_data("data")
        .then((data) => {
            generate_shortcuts(data.shortcuts);
            generate_channel_boxes(data.channels, data.guild_id);
            generate_category_select(data.categories);
        });

    let websocket = new WebSocket(`wss://${uri}`);

    websocket.onopen = function () {
        websocket.send(
            JSON.stringify({
                event: "authenticate",
                payload: _get_token(),
            })
        );
    };

    websocket.onmessage = function (event) {
        let data = JSON.parse(event.data);
        let payload = data.payload;

        switch (data.event) {
            case "message_create":
                push_new_message(payload);
                break;
            case "message_delete":
                delete_message(payload);
                break;
            case "message_edit":
                edit_message(payload);
                break;
            case "channel_update":
                channel_update(payload);
                break;
        }
    };
});

function set_theme(current_theme) {
    let themes = ["theme-light", "theme-dark", "theme-black"];

    $("body").removeClass(themes.join(" "));
    $("body").addClass(themes[current_theme]);
}

function redirect_to_login() {
    localStorage.clear();
    window.location.replace("/login");
}

function _get_token() {
    return localStorage.getItem("token");
}

async function get_token() {
    let token = _get_token();
    if (!token) {
        redirect_to_login();
    }
    else if (
        Date.now() / 1000 >=
        parseFloat(localStorage.getItem("expires_at"))
    ) {
        data = await get_api_data("refresh", (token = token));
        localStorage.setItem("token", data.token);
        localStorage.setItem("expires_at", data.expires_at);
        token = data.token;
    }
    return token;
}

async function get_api_data(
    url,
    token = null,
    method = "GET",
    ignore_ratelimit = false
) {
    if (!token) token = await get_token();

    const response = await fetch(`/api/${url}`, {
        method,
        headers: { Authorization: token },
    });

    if (response.ok) {
        return response.json();
    } else if (response.status === 401) {
        throw new Error("401 Unauthorized");
    } else if (response.status === 429 && !ignore_ratelimit) {
        throw new Error("429 Ratelimited");
    } else {
        return null;
    }
}

function generate_shortcuts(data) {
    let shortcuts = $("#shortcut-bar");
    for (c of data) {
        let new_bar = $("<div></div>");
        new_bar.addClass("shortcut linkable");
        new_bar.attr("channel_link", c.id);
        new_bar.text(c.name);

        shortcuts.append(new_bar);
    }
}

function get_disabled_categories() {
    let disabled_categories = localStorage.getItem("disabled_categories");
    if (disabled_categories === null) {
        disabled_categories = "";
    }
    return disabled_categories.split(",");

}
function generate_category_select(categories) {
    let disabled_categories = get_disabled_categories();

    let catbar = $("#category-bar");
    for (c of categories) {

        let catbutton_id = `catbutton-${c.id}`;

        let catbutton = $("<div></div>");

        catbutton.addClass("catbutton").prop("id", catbutton_id);
        catbutton.text(Array.from(c.name.toUpperCase())[0]);

        catbar.append(catbutton);

        $(`#${catbutton_id}`).click(((id) => {
            return (() => {
                toggle_category(id, null);
            });
        })(c.id));

        toggle_category(c.id, !disabled_categories.includes(c.id));
    }
}

function toggle_category(id, force_to) {
    let disabled_categories = get_disabled_categories();

    let channel_boxes = $(`.cat-${id}`);
    let category_button = $(`#catbutton-${id}`)

    if ((category_button.hasClass("selected") && force_to === null) || force_to === false) {
        channel_boxes.addClass("d-none");
        channel_boxes.removeClass("d-flex");
        category_button.removeClass("selected");

        disabled_categories.push(id);
        localStorage.setItem("disabled_categories", disabled_categories);
    } else if ((!category_button.hasClass("selected") && force_to === null) || force_to === true) {
        channel_boxes.addClass("d-flex");
        channel_boxes.removeClass("d-none");
        category_button.addClass("selected");

        localStorage.setItem("disabled_categories", disabled_categories.filter((el) => el !== id));
    }

}

function generate_channel_bar(data) {
    let new_bar = $("<div></div>");
    new_bar.addClass("channel_bar linkable d-flex justify-content-between");
    new_bar.attr("channel_link", data.id);

    let bar_pad_left = $("<div></div>").addClass("bar_pad");
    new_bar.append(bar_pad_left);
    new_bar.append($("<p></p>").text(`#${data.name}`));

    let bar_pad_right = $("<div></div>").addClass(
        "bar_pad d-flex justify-content-end"
    );
    if (data.slowmode) {
        bar_pad_right
            .addClass("slowmode_timer")
            .text(data.slowmode)
            .addClass("ml-auto")
            .attr("src", "stopwatch.svg")
            .append($("<span>").addClass("material-icons-outlined stopwatch").text("timer"));
    }

    new_bar.append(bar_pad_right);
    return new_bar;
}

function generate_channel_boxes(channels, guild_id) {
    for (d of channels) {
        let new_div = $("<div></div>");
        new_div.addClass(`channel_box d-flex flex-column cat-${d.category}`);
        new_div.attr("id", `box-${d.id}`);

        new_div.append(
            $("<div></div>").attr("id", `bar-${d.id}`).append(generate_channel_bar(d))
        );

        let new_ul = $("<ul></ul>");
        new_ul.addClass("message_list align-self-end");
        new_ul.attr("id", d.id);

        if (!d.viewable) {
            new_ul.addClass("unviewable");
        }

        new_div.append(new_ul);

        $("#main_container").append(new_div);
    }
    $(".linkable").dblclick((event) => {
        let link_url = `discord:///channels/${guild_id}/${$(
            event.currentTarget
        ).attr("channel_link")}`;
        let w = window.open(
            link_url,
            "popUpWindow",
            "height=1,width=1,left=0,top=0,resizable=no,scrollbars=no,toolbar=no,menubar=no,location=no,directories=no, status=no"
        );
        setTimeout(() => {
            w.close();
        }, 100);
    });
}

function test_link() {
    window.open(
        `discord:///channels/@me`,
        "popUpWindow",
        "height=500,width=600,left=0,top=0,resizable=no,scrollbars=no,toolbar=no,menubar=no,location=no,directories=no, status=no"
    );
}

function push_new_message(message) {
    let new_li = $("<li></li>");
    new_li.addClass("d-flex");
    new_li.attr("id", message.id);

    new_li.dblclick(() => {
        let w = window.open(
            `discord:///channels/${message.guild}/${message.channel}/${message.id}`,
            "popUpWindow",
            "height=1,width=1,left=0,top=0,resizable=no,scrollbars=no,toolbar=no,menubar=no,location=no,directories=no, status=no"
        );
        setTimeout(() => {
            w.close();
        }, 100);
    });

    if (message.system_content) {
        new_li.text(message.system_content);
        new_li.addClass("system_message");
    } else {
        let name = $("<p></p>");
        name.addClass("author");

        name.text(message.author);

        name.prepend(
            $("<img></img>").addClass("avatar").attr("src", message.avatar)
        );

        if (message.color !== "#000000") {
            name.css("color", message.color);
        }

        if (message.bot) {
            name.append(
                $("<img></img>")
                    .addClass("bot_tag")
                    .attr(
                        "src",
                        "/static/bot-tag.png"
                    )
            );
        }

        let text = $("<div></div>");
        text.addClass("message-text");
        text.attr("id", `${message.id}-content`);

        text.html(format_message(message, false));

        new_li.append(name).append(text);
    }

    let ul = $(`#${message.channel}`);

    ul.append(new_li);
    if (ul.children().length > 100) {
        ul.find("li:first").remove();
    }

    ul.scrollTop(function () {
        return this.scrollHeight;
    });
}

function delete_message(payload) {
    $(`#${payload.id}`).addClass("deleted");
}

function edit_message(payload) {
    let msg = $(`#${payload.id}-content`);
    if (msg.length > 0) {
        msg.html(format_message(payload, payload.content_edited));
    }
    if (msg.is(":last-child")) {
        let ul = $(`#${payload.channel}`);
        ul.scrollTop(function () {
            return this.scrollHeight;
        });
    }
}

function channel_update(channel) {
    let box = $(`#box-${channel.id}`);
    channel.viewable ? box.removeClass("unviewable") : box.addClass("unviewable");

    $(`#bar-${channel.id}`).html(generate_channel_bar(channel));
}

function format_content(content) {
    let ret = marked.parse(content.replaceAll("\n", "\n\n"));
    ret = ret.replaceAll(
        /&lt;a?:(\w+):(\d+)&gt;/g,
        `<img class="emoji" alt="$1" src="https://cdn.discordapp.com/emojis/$2.png">`
    );
    ret = twemoji.parse(ret);

    return ret;
}

function format_embed(embed) {
    let ret = $("<div></div>");

    if (embed.type === "image") {
        ret.append(
            $("<img></img>")
                .addClass("embed_image attachment")
                .attr("src", embed.thumbnail.proxy_url)
        );
    } else {
        ret.addClass("embed");
        let color = embed.color
            ? "#" + embed.color.toString(16).padStart(6, "0")
            : "#E3E5E8";
        ret.css("border-color", color);

        if (embed.author) {
            let authortext;

            if (embed.author.url) {
                authortext = $("<a></a>");
                authortext.attr("href", embed.author.url).attr("target", "_blank");
            } else {
                authortext = $("<p></p>");
            }

            authortext.text(embed.author.name);

            let author = authortext;

            if (embed.author.url) {
                author = $("<p></p>").append(authortext);
            }

            author.addClass("embed_author");

            if (embed.author.proxy_icon_url) {
                author.prepend(
                    $("<img></img>")
                        .addClass("embed_author_icon")
                        .attr("src", embed.author.proxy_icon_url)
                );
            }

            ret.append(author);
        }

        if (embed.title) {
            let titletext;

            if (embed.url) {
                titletext = $("<a></a>");
                titletext.attr("href", embed.url).attr("target", "_blank");
            } else {
                titletext = $("<p></p>");
            }

            titletext.text(embed.title);

            let title = titletext;

            if (embed.url) {
                title = $("<p></p>").append(titletext);
            }

            title.addClass("embed_title");
            ret.append(title);
        }

        if (embed.description && embed.type != "video") {
            ret.append(format_content(embed.description));
        }

        if (embed.fields) {
            let fields = $("<div></div>");
            fields.addClass("embed_fields d-flex flex-wrap");
            for (f of embed.fields) {
                let field = $("<div></div>");
                field.addClass("embed_field");
                if (f.inline) {
                    field.addClass("embed_field_inline");
                }
                field.append($("<p></p>").addClass("embed_field_title").text(f.name));
                field.append($("<p></p>").addClass("embed_field_value").text(f.value));

                fields.append(field);
            }

            ret.append(fields);
        }

        if (embed.image) {
            let image = $("<img></img>");
            image.addClass("embed_image attachment");
            image.attr("src", embed.image.proxy_url);

            ret.append(image);
        }

        if (embed.video && embed.thumbnail) {
            let video = $("<div></div>");
            video.addClass("video");
            video.text("Video:");

            let videothumbnail = $("<img></img>");
            videothumbnail.addClass("embed_image attachment");
            videothumbnail.attr("src", embed.thumbnail.proxy_url);

            video.append(
                $("<a></a>")
                    .attr("href", embed.url)
                    .attr("target", "_blank")
                    .append(videothumbnail)
            );
            ret.append(video);
        }

        if (embed.footer) {
            let footer = $("<p></p>");
            footer.addClass("embed_footer");
            footer.text(embed.footer.text);
            if (embed.footer.proxy_icon_url) {
                footer.prepend(
                    $("<img></img>")
                        .addClass("embed_footer_icon")
                        .attr("src", embed.footer.proxy_icon_url)
                );
            }
            ret.append(footer);
        }
    }

    return ret.prop("outerHTML");
}

function format_sticker(sticker) {
    return $("<div></div>").text(`Sticker: ${sticker.name}`).addClass("sticker-marker").prop("outerHTML");
}

function format_message(message, mark_edited) {
    let ret = format_content(message.content);

    if (message.reply.is_reply) {
        reply_ret = $("<p></p>").addClass("reply-string");
        reply_ret.append($("<span></span>").addClass("reply-icon material-icons-outlined").text("reply"));

        if (message.reply.name) {
            reply_name = $("<span></span>").addClass("author").text(message.reply.name);
            if (message.reply.color !== "#000000") {
                reply_name.css("color", message.reply.color);
            }
            reply_ret.append(reply_name);
        }

        ret = reply_ret.prop("outerHTML") + ret;
    }

    if (mark_edited) {
        let new_ret = $(ret);
        new_ret.find("a").attr("target", "_blank");
        let last_em = new_ret.last();
        let last_child = last_em.find(":last-child");
        if (last_child.length > 0) {
            last_em = last_child;
        }
        last_em.addClass("edited-marker");
        ret = new_ret
            .toArray()
            .map((i) => {
                return $(i).prop("outerHTML");
            })
            .join("\n");
    }


    for (a of message.attachments) {
        let filename = a.split("/").pop();
        let done = false;
        for (i of [".png", ".gif", ".jpg", ".jpeg"]) {
            if (filename.toLowerCase().endsWith(i)) {
                let spoiler_tag = filename.startsWith("SPOILER_");

                ret += `<div${spoiler_tag ? ' class="spoiler"' : ""
                    }><p><img class="attachment" src="${a}"></p></div>`;
                done = true;
                break;
            }
        }

        if (!done) {
            ret += `<p><a target="_blank" href="${a}">${filename}</p>`;
        }
    }

    for (s of message.stickers) {
        ret += format_sticker(s);
    }

    for (e of message.embeds) {
        ret += format_embed(e);
    }

    ret = DOMPurify.sanitize(ret);

    return ret;
}

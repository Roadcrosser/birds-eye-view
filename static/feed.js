
$(function () {
    let ws_protocol = window.location.protocol == "https:" ? "wss:" : "ws:";
    let uri = `${window.location.hostname}:${window.location.port}`;

    fetch("/data").then(response => response.json()).then(data => { generate_shortcuts(data.shortcuts); generate_channel_boxes(data); });


    let websocket = new WebSocket(`${ws_protocol}//${uri}`);

    websocket.onmessage = function (event) {
        let data = JSON.parse(event.data);
        let payload = data.payload

        switch (data.event) {
            case "message_create": push_new_message(payload); break;
            case "message_delete": delete_message(payload); break;
            case "message_edit": edit_message(payload); break;
            case "channel_update": channel_update(payload); break;
        }
    }

});

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

function generate_channel_bar(data) {
    let new_bar = $("<div></div>");
    new_bar.addClass("channel_bar linkable d-flex justify-content-between");
    new_bar.attr("channel_link", data.id);

    let bar_pad_left = $("<div></div>").addClass("bar_pad");
    new_bar.append(bar_pad_left);
    new_bar.append($("<p></p>").text(`#${data.name}`));

    let bar_pad_right = $("<div></div>").addClass("bar_pad d-flex justify-content-end");
    if (data.slowmode) {
        bar_pad_right.addClass("slowmode_timer").text(data.slowmode).addClass("ml-auto").attr("src", "stopwatch.svg").append($("<img>").attr("src", "static/stopwatch.svg"));
    }

    new_bar.append(bar_pad_right);
    return new_bar;

}

function generate_channel_boxes(data) {
    for (d of data.channels) {
        let new_div = $("<div></div>");
        new_div.addClass("channel_box d-flex flex-column");
        new_div.attr("id", `box-${d.id}`)

        new_div.append($("<div></div>").attr("id", `bar-${d.id}`).append(generate_channel_bar(d)));

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
        let w = window.open(`discord:///channels/${data.guild}/${$(event.target).attr("channel_link")}`, "popUpWindow", 'height=1,width=1,left=0,top=0,resizable=no,scrollbars=no,toolbar=no,menubar=no,location=no,directories=no, status=no')
        setTimeout(() => {
            w.close();
        }, 100)
    })
}

function test_link() {
    window.open(`discord:///channels/@me`, "popUpWindow", 'height=1,width=1,left=0,top=0,resizable=no,scrollbars=no,toolbar=no,menubar=no,location=no,directories=no, status=no')
}

function push_new_message(message) {
    let new_li = $("<li></li>");
    new_li.addClass("d-flex");
    new_li.attr("id", message.id);

    new_li.dblclick(() => {
        let w = window.open(`discord:///channels/${message.guild}/${message.channel}/${message.id}`, "popUpWindow", 'height=1,width=1,left=0,top=0,resizable=no,scrollbars=no,toolbar=no,menubar=no,location=no,directories=no, status=no')
        setTimeout(() => {
            w.close();
        }, 100)

    })

    if (message.system_content) {
        new_li.text(message.system_content);
        new_li.addClass("system_message");
    } else {
        let name = $("<p></p>");

        name.text(message.author);
        name.prepend($("<img></img>").addClass("avatar").attr("src", message.avatar));

        name.addClass("author");
        name.css("color", message.color);

        if (message.bot) {
            name.append($("<img></img>").addClass("bot_tag").attr("src", "https://cdn.discordapp.com/attachments/383146473497559040/807173304774688768/bottag.png"));
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

    ul.scrollTop(function () { return this.scrollHeight; });

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
        ul.scrollTop(function () { return this.scrollHeight; });
    }
}

function channel_update(channel) {
    let box = $(`#box-${channel.id}`);
    channel.viewable ? box.removeClass("unviewable") : box.addClass("unviewable");

    $(`#bar-${channel.id}`).html(generate_channel_bar(channel));
}

function format_content(content) {
    let ret = marked(content.replaceAll("\n", "\n\n"));
    ret = ret.replaceAll(/&lt;a?:(\w+):(\d+)&gt;/g, `<img class="emoji" alt="$1" src="https://cdn.discordapp.com/emojis/$2.png">`);
    ret = twemoji.parse(ret);

    return ret;

}

function format_embed(embed) {
    let ret = $("<div></div>");

    if (embed.type == "image") {
        ret.append($("<img></img>").addClass("embed_image attachment").attr("src", embed.thumbnail.proxy_url))

    } else {

        ret.addClass("embed");
        let color = embed.color ? "#" + embed.color.toString(16).padStart(6, "0") : "#E3E5E8";
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
                author.prepend($("<img></img>").addClass("embed_author_icon").attr("src", embed.author.proxy_icon_url));
            }

            ret.append(author)
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
            ret.append(title)
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
            video.addClass("video")
            video.text("Video:");

            let videothumbnail = $("<img></img>");
            videothumbnail.addClass("embed_image attachment");
            videothumbnail.attr("src", embed.thumbnail.proxy_url);

            video.append($("<a></a>").attr("href", embed.url).attr("target", "_blank").append(videothumbnail));
            ret.append(video);
        }

        if (embed.footer) {
            let footer = $("<p></p>");
            footer.addClass("embed_footer");
            footer.text(embed.footer.text);
            if (embed.footer.proxy_icon_url) {
                footer.prepend($("<img></img>").addClass("embed_footer_icon").attr("src", embed.footer.proxy_icon_url));
            }
            ret.append(footer)
        }
    }


    return ret.prop("outerHTML");
}

function format_message(message, mark_edited) {

    let ret = format_content(message.content);

    if (mark_edited) {
        let new_ret = $(ret);
        new_ret.find("a").attr("target", "_blank")
        let last_em = new_ret.last();
        let last_child = last_em.find(":last-child");
        if (last_child.length > 0) {
            last_em = last_child;
        }
        last_em.addClass("edited-marker");
        ret = (new_ret.toArray().map((i) => { return $(i).prop("outerHTML") })).join("\n");
    }

    for (a of message.attachments) {
        let filename = a.split("/").pop();
        let done = false;
        for (i of [".png", ".gif", ".jpg", ".jpeg"]) {
            if (filename.toLowerCase().endsWith(i)) {
                let spoiler_tag = filename.startsWith("SPOILER_");

                ret += `<div${spoiler_tag ? " class=\"spoiler\"" : ""}><p><img class="attachment" src="${a}"></p></div>`
                done = true;
                break;
            }
        }

        if (!done) {
            ret += `<p><a target="_blank" href="${a}">${filename}</p>`
        }

    }

    for (e of message.embeds) {
        ret += format_embed(e);
    }

    ret = DOMPurify.sanitize(ret);

    return ret;
}

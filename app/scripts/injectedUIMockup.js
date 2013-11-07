var loadCSS = function (resLink) {
	var href = kango.io.getResource;
	var cssLink = $("<link>");
	$("head").append(cssLink);
	cssLink.attr({
		rel: "stylesheet",
		type: "text/css",
		href: kango.io.getResourceUrl(resLink)
	});
	console.log(kango.io.getResourceUrl(resLink));
};

// load the css file 
loadCSS("res/semantic-ui/build/packaged/css/semantic.css");
loadCSS("res/main.css");

var leftSidebar = '<div class="ui floating styled segment left wide sidebar">  <h2 class="ui header">Comment</h2>  <div class="ui form">    <div class="field">      <label>Message</label>      <textarea></textarea>    </div>    <div class="field">      <label>Rating</label>      <div class="ui large rating active">        <i class="icon"></i>        <i class="icon"></i>        <i class="icon"></i>        <i class="icon"></i>        <i class="icon"></i>      </div>    </div>    <div class="two fluid ui buttons">      <div class="ui positive button save">Save</div>      <div class="or"></div>      <div class="ui button discard">Discard</div>    </div>  </div>  <div class="ui horizontal icon divider">    <i class="circular info letter icon"></i>  </div>  <div class="ui message">    <div class="header">      Welcome back!    </div>    <p>      It is good to see you again. I have had a lot to think about since our last visit, I have changed much as a person and I can see that you have too.    </p>    <p>      Perhaps we can talk about it if you have the time.    </p>  </div></div>';
var reminderModal = '<div class="ui small modal">    <i class="close icon"></i>    <div class="ui icon info message">      <i class="comment icon"></i>      <div class="content">        <div class="header">          Please comment regularly!      </div>      <p>And be nice to Rose...</p>  </div></div></div>';
var commentLabel = '<a class="ui red ribbon label rose comment">Comment</a>';

$("body").append(reminderModal);

$(".uiUnifiedStory").addClass("segment");
$(".fbTimelineUnit ").has(".fbTimelineFeedbackActions").find("div[role=article]").addClass("segment");
$(".segment").prepend(commentLabel);

$(".ui.icon.info.message").css("margin", "0");

if ($(".fbTimelineUnit ").has(".fbTimelineFeedbackActions").find("div[role=article]").length !== 0) {
	$(".ui.red.ribbon").css("left", "-1.7rem");
	$(".ui.red.ribbon").css("margin", "0 0.2em 0.5em");
} else {
	$(".ui.red.ribbon").css("margin", "0.5em -0.2em -1em");
}

$('body').on('click', '.button.discard', function (evt) {
	evt.stopPropagation();
	$('.sidebar').sidebar('hide');
});

$('body').on('click', '.ui.red.ribbon', function () {
	$('.sidebar.left')
		.sidebar('pushPage')
		.sidebar('show');
});

$('body').on('click', '.button.save', function (evt) {
	evt.stopPropagation();
	$('.sidebar').sidebar('hide');
	var comment = $('.sidebar textarea').val() || "no comment";
	var rating = $('.ui.rating').rating("getRating") || 0;
	console.log("Comment: " + comment);
	console.log("Rating: " + rating);
});

$(function () {
	if (window.location.href.indexOf("facebook.com") > -1) {
		setTimeout(function () {
			$('.ui.modal')
				.modal('setting', 'transition', 'fade')
				.modal('show');
			$("body").append(leftSidebar);
			$('.ui.rating')
				.rating();
		}, 2000);
	}
});